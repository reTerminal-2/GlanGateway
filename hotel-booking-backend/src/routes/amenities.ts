import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/amenities/hotel/:hotelId
router.get("/hotel/:hotelId", async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    const { data: amenities, error } = await supabaseAdmin
      .from("amenities")
      .select("*")
      .eq("hotel_id", hotelId);

    if (error) throw error;
    res.json(amenities || []);
  } catch (error) {
    console.error("Error fetching amenities:", error);
    res.status(500).json({ message: "Failed to fetch amenities" });
  }
});

// POST /api/amenities
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotel_id, name, description, price, is_active } = req.body;
    
    // Verify user owns the hotel
    const { data: hotel, error: hotelError } = await supabaseAdmin
      .from("hotels")
      .select("user_id")
      .eq("id", hotel_id)
      .single();
      
    if (hotelError || !hotel || hotel.user_id !== req.userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    const { data: newAmenity, error } = await supabaseAdmin
      .from("amenities")
      .insert([{ hotel_id, name, description, price, is_active }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newAmenity);
  } catch (error) {
    console.error("Error creating amenity:", error);
    res.status(500).json({ message: "Failed to create amenity" });
  }
});

// PUT /api/amenities/:id
router.put("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data: updatedAmenity, error } = await supabaseAdmin
      .from("amenities")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(updatedAmenity);
  } catch (error) {
    console.error("Error updating amenity:", error);
    res.status(500).json({ message: "Failed to update amenity" });
  }
});

// DELETE /api/amenities/:id
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabaseAdmin
      .from("amenities")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ message: "Amenity deleted successfully" });
  } catch (error) {
    console.error("Error deleting amenity:", error);
    res.status(500).json({ message: "Failed to delete amenity" });
  }
});

export default router;
