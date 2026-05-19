import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/business-insights/:hotelId
router.get("/:hotelId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    
    // Auth check omitted for brevity

    // Example simple insight: occupancy rate or popular rooms
    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("room_id")
      .eq("hotel_id", hotelId);

    if (error) throw error;

    res.json({
      insights: [
        { title: "Total Bookings Evaluated", value: bookings?.length || 0 },
        { title: "Most Popular Feature", value: "Standard Rooms" } // Stub for real logic
      ]
    });
  } catch (error) {
    console.error("Error fetching business insights:", error);
    res.status(500).json({ message: "Failed to fetch insights" });
  }
});

export default router;
