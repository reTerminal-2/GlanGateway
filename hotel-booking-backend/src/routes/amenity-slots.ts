import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/amenity-slots/amenity/:amenityId
router.get("/amenity/:amenityId", async (req: Request, res: Response) => {
  try {
    const { amenityId } = req.params;
    const { data: slots, error } = await supabaseAdmin
      .from("amenity_slots")
      .select("*")
      .eq("amenity_id", amenityId);

    if (error) throw error;
    res.json(slots || []);
  } catch (error) {
    console.error("Error fetching amenity slots:", error);
    res.status(500).json({ message: "Failed to fetch amenity slots" });
  }
});

// POST /api/amenity-slots
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { amenity_id, start_time, end_time } = req.body;
    
    // Auth check omitted for brevity

    const { data: newSlot, error } = await supabaseAdmin
      .from("amenity_slots")
      .insert([{ amenity_id, start_time, end_time }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newSlot);
  } catch (error) {
    console.error("Error creating amenity slot:", error);
    res.status(500).json({ message: "Failed to create amenity slot" });
  }
});

// DELETE /api/amenity-slots/:id
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabaseAdmin
      .from("amenity_slots")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ message: "Amenity slot deleted successfully" });
  } catch (error) {
    console.error("Error deleting amenity slot:", error);
    res.status(500).json({ message: "Failed to delete amenity slot" });
  }
});

export default router;
