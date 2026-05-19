import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/website-feedback
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { data: feedback, error } = await supabaseAdmin
      .from("website_feedback")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(feedback || []);
  } catch (error) {
    console.error("Error fetching feedback:", error);
    res.status(500).json({ message: "Failed to fetch feedback" });
  }
});

// POST /api/website-feedback
router.post("/", async (req: Request, res: Response) => {
  try {
    const { user_id, rating, comments } = req.body; // user_id is optional for anonymous feedback
    
    const { data: newFeedback, error } = await supabaseAdmin
      .from("website_feedback")
      .insert([{ user_id, rating, comments }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newFeedback);
  } catch (error) {
    console.error("Error submitting feedback:", error);
    res.status(500).json({ message: "Failed to submit feedback" });
  }
});

export default router;
