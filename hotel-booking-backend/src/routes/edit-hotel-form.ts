import express, { Request, Response } from "express";
import verifyToken from "../middleware/auth";
import { supabaseAdmin } from "../core/supabase";

const router = express.Router();

// PUT /edit-hotel/:hotelId - Update hotel entrance fees
router.put("/:hotelId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    const entranceFeeData = req.body;

    // Validate entrance fee data
    if (entranceFeeData) {
      if (entranceFeeData.rooms) {
        if (typeof entranceFeeData.rooms.enabled !== 'boolean' ||
            typeof entranceFeeData.rooms.adultCount !== 'number' ||
            typeof entranceFeeData.rooms.childCount !== 'number') {
          return res.status(400).json({ error: "Invalid rooms entrance fee data format" });
        }
      }

      if (entranceFeeData.cottages) {
        if (typeof entranceFeeData.cottages.enabled !== 'boolean' ||
            typeof entranceFeeData.cottages.adultCount !== 'number' ||
            typeof entranceFeeData.cottages.childCount !== 'number') {
          return res.status(400).json({ error: "Invalid cottages entrance fee data format" });
        }
      }
    }

    // Update rooms with included entrance fees
    if (entranceFeeData.rooms) {
      const { data: rooms } = await supabaseAdmin
        .from("rooms")
        .select("id")
        .eq("hotel_id", hotelId);

      if (rooms && rooms.length > 0) {
        await supabaseAdmin
          .from("rooms")
          .update({
            included_entrance_fee: {
              enabled: entranceFeeData.rooms.enabled || false,
              adultCount: entranceFeeData.rooms.adultCount || 0,
              childCount: entranceFeeData.rooms.childCount || 0,
            }
          })
          .eq("hotel_id", hotelId);
      }
    }

    // Update cottages with included entrance fees
    if (entranceFeeData.cottages) {
      const { data: cottages } = await supabaseAdmin
        .from("cottages")
        .select("id")
        .eq("hotel_id", hotelId);

      if (cottages && cottages.length > 0) {
        await supabaseAdmin
          .from("cottages")
          .update({
            included_entrance_fee: {
              enabled: entranceFeeData.cottages.enabled || false,
              adultCount: entranceFeeData.cottages.adultCount || 0,
              childCount: entranceFeeData.cottages.childCount || 0,
            }
          })
          .eq("hotel_id", hotelId);
      }
    }

    // Update hotel timestamp
    await supabaseAdmin
      .from("hotels")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", hotelId);

    // Return the updated hotel
    const { data: updatedHotel } = await supabaseAdmin
      .from("hotels")
      .select("*")
      .eq("id", hotelId)
      .maybeSingle();

    res.json({
      success: true,
      message: "Hotel entrance fees updated successfully",
      hotel: updatedHotel ? { ...updatedHotel, _id: updatedHotel.id } : null
    });

  } catch (error) {
    console.error("Error updating hotel entrance fees:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
