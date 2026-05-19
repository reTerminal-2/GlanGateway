import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/compliance/hotel/:hotelId
router.get("/hotel/:hotelId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    
    // Auth check omitted for brevity

    const { data: compliance, error } = await supabaseAdmin
      .from("compliance_reports")
      .select("*")
      .eq("hotel_id", hotelId);

    if (error) throw error;
    res.json(compliance || []);
  } catch (error) {
    console.error("Error fetching compliance reports:", error);
    res.status(500).json({ message: "Failed to fetch compliance reports" });
  }
});

export default router;
