import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/admin-management/users
router.get("/users", verifyToken, async (req: Request, res: Response) => {
  try {
    // Requires admin privilege
    // const { userRole } = req; // Assuming verifyToken sets this

    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();

    if (error) throw error;
    res.json(users || []);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

// GET /api/admin-management/hotels
router.get("/hotels", verifyToken, async (req: Request, res: Response) => {
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
