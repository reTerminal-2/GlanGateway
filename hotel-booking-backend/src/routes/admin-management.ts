import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// Helper helper function to map Postgres user properties to camelCase expected by the frontend
const mapUserToFrontend = (user: any) => {
  if (!user) return null;
  return {
    _id: user.id,
    id: user.id,
    email: user.email,
    firstName: user.first_name,
    lastName: user.last_name,
    role: user.role,
    image: user.image,
    birthdate: user.birthdate,
    isPWD: user.is_pwd,
    pwdId: user.pwd_id,
    isActive: user.is_active !== false, // default to true if undefined
    createdAt: user.created_at
  };
};

// Middleware to verify the requesting user is an Admin or Super Admin
const verifyAdminAccess = async (req: Request, res: Response, next: any) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    if (error || !user || (user.role !== "admin" && user.role !== "superAdmin")) {
      return res.status(403).json({ message: "Access denied. Admin privilege required." });
    }
    next();
  } catch (error) {
    console.error("Admin verification error:", error);
    res.status(500).json({ message: "Internal server error during authorization checks." });
  }
};

// GET /api/admin-management/users
router.get("/users", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json((users || []).map(mapUserToFrontend));
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// GET /api/admin-management/search-users
router.get("/search-users", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const query = req.query.query as string;
    if (!query || query.trim().length === 0) {
      return res.json([]);
    }

    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json((users || []).map(mapUserToFrontend));
  } catch (error) {
    console.error("Error searching users:", error);
    res.status(500).json({ message: "Failed to search users" });
  }
});

// PUT /api/admin-management/promote-to-admin/:userId
router.put("/promote-to-admin/:userId", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .update({ role: "admin" })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "User promoted to Admin successfully", user: mapUserToFrontend(user) });
  } catch (error) {
    console.error("Error promoting user to admin:", error);
    res.status(500).json({ message: "Failed to promote user to Admin" });
  }
});

// PUT /api/admin-management/demote-to-user/:userId
router.put("/demote-to-user/:userId", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .update({ role: "user" })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "User demoted to regular user successfully", user: mapUserToFrontend(user) });
  } catch (error) {
    console.error("Error demoting user:", error);
    res.status(500).json({ message: "Failed to demote user" });
  }
});

// DELETE /api/admin-management/delete-user/:userId
router.delete("/delete-user/:userId", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const { error } = await supabaseAdmin
      .from("users")
      .delete()
      .eq("id", userId);

    if (error) throw error;
    res.json({ message: "User account deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

// PUT /api/admin-management/toggle-user-status/:userId
router.put("/toggle-user-status/:userId", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const { data: user, error: fetchError } = await supabaseAdmin
      .from("users")
      .select("is_active")
      .eq("id", userId)
      .single();

    if (fetchError || !user) {
      return res.status(404).json({ message: "User not found" });
    }

    const nextStatus = !user.is_active;

    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from("users")
      .update({ is_active: nextStatus })
      .eq("id", userId)
      .select()
      .single();

    if (updateError) throw updateError;

    res.json({
      message: `User account successfully ${nextStatus ? "enabled" : "disabled"}`,
      isActive: nextStatus,
      user: mapUserToFrontend(updatedUser)
    });
  } catch (error) {
    console.error("Error toggling user status:", error);
    res.status(500).json({ message: "Failed to toggle user status" });
  }
});

// GET /api/admin-management/resort-owners
router.get("/resort-owners", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { data: users, error } = await supabaseAdmin
      .from("users")
      .select("*")
      .eq("role", "resort_owner")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json((users || []).map(mapUserToFrontend));
  } catch (error) {
    console.error("Error fetching resort owners:", error);
    res.status(500).json({ message: "Failed to fetch resort owners" });
  }
});

// PUT /api/admin-management/demote-resort-owner/:userId
router.put("/demote-resort-owner/:userId", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const { data: user, error } = await supabaseAdmin
      .from("users")
      .update({ role: "user" })
      .eq("id", userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ message: "Resort owner demoted to regular user successfully", user: mapUserToFrontend(user) });
  } catch (error) {
    console.error("Error demoting resort owner:", error);
    res.status(500).json({ message: "Failed to demote resort owner" });
  }
});

// GET /api/admin-management/hotels
router.get("/hotels", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { data: hotels, error } = await supabaseAdmin
      .from("hotels")
      .select("*");

    if (error) throw error;
    res.json(hotels || []);
  } catch (error) {
    console.error("Error fetching hotels:", error);
    res.status(500).json({ message: "Failed to fetch hotels" });
  }
});

export default router;
