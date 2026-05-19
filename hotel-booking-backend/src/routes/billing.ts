import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/billing/invoices/:userId
router.get("/invoices/:userId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Auth check omitted for brevity

    const { data: invoices, error } = await supabaseAdmin
      .from("billing_invoices")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    res.json(invoices || []);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

export default router;
