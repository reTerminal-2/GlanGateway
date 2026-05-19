import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/room-blocks/room/:roomId
router.get("/room/:roomId", async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const { data: blocks, error } = await supabaseAdmin
      .from("room_blocks")
      .select("*")
      .eq("room_id", roomId);

    if (error) throw error;
    res.json(blocks || []);
  } catch (error) {
    console.error("Error fetching room blocks:", error);
    res.status(500).json({ message: "Failed to fetch room blocks" });
  }
});

// POST /api/room-blocks
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { room_id, start_date, end_date, reason } = req.body;
    
    // Auth check omitted for brevity

    const { data: newBlock, error } = await supabaseAdmin
      .from("room_blocks")
      .insert([{ room_id, start_date, end_date, reason }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newBlock);
  } catch (error) {
    console.error("Error creating room block:", error);
    res.status(500).json({ message: "Failed to create room block" });
  }
});

// DELETE /api/room-blocks/:id
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabaseAdmin
      .from("room_blocks")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ message: "Room block deleted successfully" });
  } catch (error) {
    console.error("Error deleting room block:", error);
    res.status(500).json({ message: "Failed to delete room block" });
  }
});

export default router;
