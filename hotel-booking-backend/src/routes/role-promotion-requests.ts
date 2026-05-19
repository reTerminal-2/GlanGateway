import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/role-promotion-requests
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { data: requests, error } = await supabaseAdmin
      .from("role_promotion_requests")
      .select("*");

    if (error) throw error;
    res.json(requests || []);
  } catch (error) {
    console.error("Error fetching promotion requests:", error);
    res.status(500).json({ message: "Failed to fetch promotion requests" });
  }
});

// POST /api/role-promotion-requests
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { requested_role, notes } = req.body;
    
    const { data: newRequest, error } = await supabaseAdmin
      .from("role_promotion_requests")
      .insert([{ user_id: req.userId, requested_role, notes, status: 'pending' }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newRequest);
  } catch (error) {
    console.error("Error submitting promotion request:", error);
    res.status(500).json({ message: "Failed to submit promotion request" });
  }
});

export default router;
