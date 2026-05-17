import express, { Request, Response } from "express";
import { validate, loginSchema, registerSchema } from '../validations';
import { check, validationResult } from "express-validator";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import verifyToken from "../middleware/auth";
import { restrictAdminToSubdirectory } from "../middleware/admin-access-control";
import { SessionManager } from "../utils/sessionUtils";
import { supabase, supabaseAdmin } from "../core/supabase";

const router = express.Router();

// Rate limiter for login endpoint: 30 attempts per 15 minutes (faster for development)
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // increased from 20 to 30 for development
  message: { message: "Too many login attempts, please try again after 15 minutes" },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
});

const GOOGLE_CLIENT_ID = process.env.GOOGLE_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_SECRET;
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:5174").replace(
  /\/$/,
  ""
);
const BACKEND_URL = (
  process.env.BACKEND_URL ||
  `http://localhost:${process.env.PORT || 5000}`
).replace(/\/$/, "");

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth
 *     description: Redirects user to Google sign-in
 *     tags: [Authentication]
 */
router.get("/google", (req: Request, res: Response) => {
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ message: "Google OAuth not configured" });
  }
  const state = crypto.randomBytes(32).toString("hex");
  
  // Store state in httpOnly cookie for CSRF protection
  res.cookie("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    maxAge: 10 * 60 * 1000, // 10 minutes
    path: "/",
  });
  
  const redirectUri = `${BACKEND_URL}/api/auth/callback/google`;
  const scope = "openid email profile";
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${state}&access_type=offline&prompt=consent`;
  res.redirect(url);
});

/**
 * @swagger
 * /api/auth/callback/google:
 *   get:
 *     summary: Google OAuth callback
 *     description: Handles redirect from Google, creates/logs in user
 *     tags: [Authentication]
 */
router.get("/callback/google", async (req: Request, res: Response) => {
  const { code, error, state } = req.query;

  if (error) {
    return res.redirect(
      `${FRONTEND_URL}/sign-in?error=${encodeURIComponent(String(error))}`
    );
  }

  if (!code || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect(
      `${FRONTEND_URL}/sign-in?error=oauth_config`
    );
  }

  // Validate state parameter for CSRF protection
  const storedState = req.cookies?.oauth_state;
  if (!storedState || storedState !== state) {
    return res.redirect(
      `${FRONTEND_URL}/sign-in?error=invalid_state`
    );
  }
  
  // Clear the state cookie after validation
  res.clearCookie("oauth_state");

  try {
    const redirectUri = `${BACKEND_URL}/api/auth/callback/google`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error) {
      console.error("Google token error:", tokenData);
      return res.redirect(
        `${FRONTEND_URL}/sign-in?error=token_exchange`
      );
    }

    const userRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      }
    );
    const googleUser = await userRes.json();

    const email = googleUser.email;
    const name = googleUser.name || "";
    const [firstName, ...lastParts] = name.split(" ");
    const lastName = lastParts.join(" ") || firstName;
    const image = googleUser.picture || undefined;

    // Fetch profile from public.users table in Supabase
    const { data: dbUser, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    let finalUser = dbUser;

    if (!dbUser) {
      // Create new user in Supabase
      const userId = crypto.randomUUID();
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const hashedPassword = await bcrypt.hash(randomPassword, 10);

      const { data: newUser, error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          id: userId,
          email,
          password: hashedPassword,
          first_name: firstName || "User",
          last_name: lastName || "Google",
          role: "user",
          image: image || null,
          birthdate: null,
          is_pwd: false,
          pwd_id: null,
          pwd_id_verified: false,
          account_verified: true,
          email_verified: true
        })
        .select()
        .single();

      if (insertError) {
        console.error("❌ Failed to create Google OAuth user in Supabase:", insertError);
        return res.redirect(`${FRONTEND_URL}/sign-in?error=database_error`);
      }
      finalUser = newUser;
    } else {
      // Update existing user profile image/verification in Supabase
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from("users")
        .update({
          image: image || dbUser.image,
          email_verified: true
        })
        .eq("id", dbUser.id)
        .select()
        .single();

      if (updateError) {
        console.error("❌ Failed to update Google OAuth user in Supabase:", updateError);
      } else {
        finalUser = updatedUser;
      }
    }

    const effectiveRole = finalUser.role || "user";

    // Create proper session using SessionManager
    const token = SessionManager.createAccessToken(
      finalUser.id, 
      finalUser.email, 
      effectiveRole
    );

    // Set secure authentication cookie so all API calls work immediately
    res.cookie("session_id", token, SessionManager.getCookieOptions());

    const redirectUrl = new URL(`${FRONTEND_URL}/auth/callback`);
    redirectUrl.searchParams.set("token", token);
    redirectUrl.searchParams.set("userId", finalUser.id);
    redirectUrl.searchParams.set("email", finalUser.email);
    redirectUrl.searchParams.set("firstName", finalUser.first_name || "User");
    redirectUrl.searchParams.set("lastName", finalUser.last_name || "Google");
    if (finalUser.image) redirectUrl.searchParams.set("image", finalUser.image);

    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error("Google OAuth error:", err);
    res.redirect(
      `${FRONTEND_URL}/sign-in?error=server_error`
    );
  }
});

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with email and password
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 description: User's password
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   description: User ID
 *       400:
 *         description: Invalid credentials or validation error
 *       500:
 *         description: Server error
 */
router.post(
  "/login",
  loginRateLimiter,
  [
    check("email", "Email is required").isEmail(),
    check("password", "Password with 6 or more characters required").isLength({
      min: 6,
    }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // 1. Fetch profile from public.users table by email
      const { data: dbUser, error: dbError } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (dbError || !dbUser) {
        console.log("❌ Login failed: User not found or DB error:", email);
        return res.status(400).json({ message: "Invalid Credentials" });
      }

      // 2. Compare password with hashed password
      if (!dbUser.password) {
        console.log("❌ Login failed: User does not have a local password set:", email);
        return res.status(400).json({ message: "Invalid Credentials" });
      }

      const isMatch = await bcrypt.compare(password, dbUser.password);
      if (!isMatch) {
        console.log("❌ Login failed: Password mismatch for email:", email);
        return res.status(400).json({ message: "Invalid Credentials" });
      }

      const effectiveRole = dbUser.role || "user";

      // 3. Create proper session using SessionManager
      const token = SessionManager.createAccessToken(
        dbUser.id, 
        dbUser.email, 
        effectiveRole
      );

      // Set secure authentication cookie
      res.cookie("session_id", token, SessionManager.getCookieOptions());

      // Optimized response
      res.status(200).json({
        userId: dbUser.id,
        message: "Login successful",
        token: token,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.first_name,
          lastName: dbUser.last_name,
          role: effectiveRole,
        },
        isAdminOverride: false,
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Something went wrong" });
    }
  }
);

// Alias for /login endpoint to match frontend expectations
router.post(
  "/sign-in",
  loginRateLimiter,
  [
    check("email", "Email is required").isEmail(),
    check("password", "Password with 6 or more characters required").isLength({
      min: 6,
    }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // 1. Fetch profile from public.users table by email
      const { data: dbUser, error: dbError } = await supabaseAdmin
        .from("users")
        .select("*")
        .eq("email", email)
        .maybeSingle();

      if (dbError || !dbUser) {
        console.log("❌ SignIn failed: User not found or DB error:", email);
        return res.status(400).json({ message: "Invalid Credentials" });
      }

      // 2. Compare password with hashed password
      if (!dbUser.password) {
        console.log("❌ SignIn failed: User does not have a local password set:", email);
        return res.status(400).json({ message: "Invalid Credentials" });
      }

      const isMatch = await bcrypt.compare(password, dbUser.password);
      if (!isMatch) {
        console.log("❌ SignIn failed: Password mismatch for email:", email);
        return res.status(400).json({ message: "Invalid Credentials" });
      }

      const effectiveRole = dbUser.role || "user";

      // 3. Create proper session using SessionManager
      const token = SessionManager.createAccessToken(
        dbUser.id, 
        dbUser.email, 
        effectiveRole
      );

      // Set secure authentication cookie
      res.cookie("session_id", token, SessionManager.getCookieOptions());

      // Optimized response
      res.status(200).json({
        userId: dbUser.id,
        message: "Login successful",
        token: token,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.first_name,
          lastName: dbUser.last_name,
          role: effectiveRole,
        },
        isAdminOverride: false,
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Something went wrong" });
    }
  }
);

/**
 * @swagger
 * /api/auth/validate-token:
 *   get:
 *     summary: Validate authentication token
 *     description: Validate the current user's authentication token
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
 *                   description: User ID
 *       401:
 *         description: Token is invalid or expired
 */
router.get("/validate-token", verifyToken, (req: Request, res: Response) => {
  res.status(200).send({ userId: req.userId });
});

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current user info
 *     description: Get the current authenticated user's information
 *     tags: [Authentication]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: User ID
 *                     email:
 *                       type: string
 *                       description: User email
 *                     firstName:
 *                       type: string
 *                       description: User first name
 *                     lastName:
 *                       type: string
 *                       description: User last name
 *                     role:
 *                       type: string
 *                       description: User role
 *       401:
 *         description: User not authenticated
 */
router.get("/me", verifyToken, async (req: Request, res: Response) => {
  try {
    // Debug logging to identify the issue
    console.log('DEBUG /api/auth/me - req.userId:', req.userId);
    console.log('DEBUG /api/auth/me - req.user:', req.user);
    
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", req.userId)
      .maybeSingle();

    if (error || !user) {
      console.log('DEBUG /api/auth/me - User not found for ID:', req.userId);
      return res.status(401).json({ message: "User not found" });
    }
    
    console.log('DEBUG /api/auth/me - Found user:', {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role
    });
    
    res.status(200).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        image: user.image,
      }
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: User logout
 *     description: Logout user by clearing authentication cookie
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Logout successful
 */
router.post("/logout", (req: Request, res: Response) => {
  res.cookie("session_id", "", {
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
  });
  res.send();
});

/**
 * @swagger
 * /api/auth/sign-out:
 *   post:
 *     summary: User sign out (alias for logout)
 *     description: Sign out user by clearing authentication cookie
 *     tags: [Authentication]
 *     responses:
 *       200:
 *         description: Sign out successful
 */
router.post("/sign-out", (req: Request, res: Response) => {
  res.cookie("session_id", "", {
    expires: new Date(0),
    maxAge: 0,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
    path: "/",
  });
  res.send();
});

export default router;
