import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/housekeeping-tasks/hotel/:hotelId
router.get("/hotel/:hotelId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    
    // Auth check omitted for brevity

    const { data: tasks, error } = await supabaseAdmin
      .from("housekeeping_tasks")
      .select("*")
      .eq("hotel_id", hotelId);

    if (error) throw error;
    res.json(tasks || []);
  } catch (error) {
    console.error("Error fetching housekeeping tasks:", error);
    res.status(500).json({ message: "Failed to fetch housekeeping tasks" });
  }
});

// POST /api/housekeeping-tasks
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotel_id, room_id, staff_id, task_type, notes } = req.body;
    
    const { data: newTask, error } = await supabaseAdmin
      .from("housekeeping_tasks")
      .insert([{ hotel_id, room_id, staff_id, task_type, status: 'pending', notes }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newTask);
  } catch (error) {
    console.error("Error creating housekeeping task:", error);
    res.status(500).json({ message: "Failed to create housekeeping task" });
  }
});

export default router;
