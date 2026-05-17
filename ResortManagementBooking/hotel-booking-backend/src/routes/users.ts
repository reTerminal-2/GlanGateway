import express, { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { check, validationResult } from "express-validator";
import verifyToken from "../middleware/auth";
import { supabaseAdmin } from "../core/supabase";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const router = express.Router();

router.get("/me", verifyToken, async (req: Request, res: Response) => {
  const userId = req.userId;

  try {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (error || !user) {
      return res.status(400).json({ message: "User not found" });
    }
    
    // Map database properties to expected camelCase
    res.json({
      _id: user.id,
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      role: user.role,
      image: user.image,
      birthdate: user.birthdate,
      isPWD: user.is_pwd,
      pwdId: user.pwd_id
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "something went wrong" });
  }
});

router.post(
  "/register",
  [
    check("firstName", "First Name is required").isString(),
    check("lastName", "Last Name is required").isString(),
    check("email", "Email is required").isEmail(),
    check("password", "Password with 6 or more characters required").isLength({
      min: 6,
    }),
    check("birthdate", "Birthdate is required").isISO8601().toDate(),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log("❌ Registration validation errors:", errors.array());
      return res.status(400).json({ message: errors.array() });
    }

    try {
      const { email, password, firstName, lastName, birthdate, isPWD, pwdId } = req.body;
      console.log("📝 Custom Register attempt for email:", email);
      
      // 1. Check if user already exists
      const { data: existingUser, error: checkError } = await supabaseAdmin
        .from("users")
        .select("email")
        .eq("email", email)
        .maybeSingle();

      if (existingUser) {
        console.log("❌ Register failed: User already exists in database:", email);
        return res.status(400).json({ message: "User already exists" });
      }

      // Validate PWD ID if isPWD is true
      if (isPWD && !pwdId) {
        console.log("❌ Register failed: PWD ID missing for PWD option");
        return res.status(400).json({ message: "PWD ID is required when PWD option is selected" });
      }

      // 2. Hash the password and generate a custom UUID
      const userId = crypto.randomUUID();
      const hashedPassword = await bcrypt.hash(password, 10);

      // 3. Create public.users profile directly from the backend using Admin client
      console.log("📡 Creating public profile for user:", userId);
      const { error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          id: userId,
          email,
          password: hashedPassword,
          first_name: firstName,
          last_name: lastName,
          role: 'user',
          birthdate: birthdate ? new Date(birthdate).toISOString().split('T')[0] : null,
          is_pwd: isPWD || false,
          pwd_id: pwdId || null,
          pwd_id_verified: false,
          account_verified: false,
          email_verified: true
        });

      if (insertError) {
        console.error("❌ Failed to create user profile in database:", insertError.message);
        return res.status(500).json({ message: "Failed to create user profile: " + insertError.message });
      }

      // 4. Generate local session access token
      const token = jwt.sign(
        { userId: userId },
        process.env.JWT_SECRET_KEY as string,
        {
          expiresIn: "1d",
        }
      );

      res.cookie("auth_token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        maxAge: 86400000,
        path: "/",
      });
      
      const message = isPWD 
        ? "User registered OK. Your PWD ID is pending verification by a Super Admin."
        : "User registered OK";
      
      return res.status(200).send({ message, requiresVerification: isPWD || false });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).send({ message: error.message || "Something went wrong" });
    }
  }
);

export default router;
