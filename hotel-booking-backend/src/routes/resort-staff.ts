import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/resort-staff/tasks/:staffId
router.get("/tasks/:staffId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { staffId } = req.params;
    
    // Auth check omitted for brevity

    const { data: tasks, error } = await supabaseAdmin
      .from("housekeeping_tasks")
      .select("*")
      .eq("staff_id", staffId);

    if (error) throw error;
    res.json(tasks || []);
  } catch (error) {
    console.error("Error fetching staff tasks:", error);
    res.status(500).json({ message: "Failed to fetch staff tasks" });
  }
});

export default router;
