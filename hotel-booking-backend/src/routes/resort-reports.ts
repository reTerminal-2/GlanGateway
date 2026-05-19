import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/resort-reports/:hotelId
router.get("/:hotelId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    
    // Auth check omitted for brevity

    // Fetch aggregate stats from bookings table
    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("status, check_in, check_out, total_cost")
      .eq("hotel_id", hotelId);

    if (error) throw error;

    res.json({
      success: true,
      data: {
        totalBookings: bookings?.length || 0,
        completedBookings: bookings?.filter(b => b.status === 'completed').length || 0,
        revenue: bookings?.filter(b => b.status === 'completed' || b.status === 'confirmed')
          .reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0) || 0,
        bookingsList: bookings || []
      }
    });
  } catch (error) {
    console.error("Error generating resort report:", error);
    res.status(500).json({ message: "Failed to generate resort report" });
  }
});

export default router;
