import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/reports/revenue/:hotelId
router.get("/revenue/:hotelId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    
    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("created_at, total_cost")
      .eq("hotel_id", hotelId)
      .in("status", ["completed", "confirmed"]);

    if (error) throw error;

    // Group by month/day (simplified for now)
    res.json({
      totalRevenue: bookings?.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0) || 0,
      bookingsCount: bookings?.length || 0,
      data: bookings || []
    });
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ message: "Failed to generate report" });
  }
});

export default router;
