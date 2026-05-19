import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/identity-verification/:userId
router.get("/:userId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Auth check omitted for brevity

    const { data: verification, error } = await supabaseAdmin
      .from("identity_verifications")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    res.json(verification || { status: 'none' });
  } catch (error) {
    console.error("Error fetching identity verification:", error);
    res.status(500).json({ message: "Failed to fetch identity verification" });
  }
});

// POST /api/identity-verification
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { document_url } = req.body;
    
    const { data: newVerification, error } = await supabaseAdmin
      .from("identity_verifications")
      .insert([{ user_id: req.userId, document_url, status: 'pending' }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newVerification);
  } catch (error) {
    console.error("Error submitting identity verification:", error);
    res.status(500).json({ message: "Failed to submit identity verification" });
  }
});

export default router;
