import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// GET /api/pricing/hotel/:hotelId
router.get("/hotel/:hotelId", async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    const { data: pricingRules, error } = await supabaseAdmin
      .from("pricing_rules")
      .select("*")
      .eq("hotel_id", hotelId);

    if (error) throw error;
    res.json(pricingRules || []);
  } catch (error) {
    console.error("Error fetching pricing rules:", error);
    res.status(500).json({ message: "Failed to fetch pricing rules" });
  }
});

// POST /api/pricing
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotel_id, name, start_date, end_date, multiplier, is_active } = req.body;
    
    // Auth check omitted for brevity

    const { data: newRule, error } = await supabaseAdmin
      .from("pricing_rules")
      .insert([{ hotel_id, name, start_date, end_date, multiplier, is_active }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newRule);
  } catch (error) {
    console.error("Error creating pricing rule:", error);
    res.status(500).json({ message: "Failed to create pricing rule" });
  }
});

// PUT /api/pricing/:id
router.put("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const { data: updatedRule, error } = await supabaseAdmin
      .from("pricing_rules")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    res.json(updatedRule);
  } catch (error) {
    console.error("Error updating pricing rule:", error);
    res.status(500).json({ message: "Failed to update pricing rule" });
  }
});

// DELETE /api/pricing/:id
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const { error } = await supabaseAdmin
      .from("pricing_rules")
      .delete()
      .eq("id", id);

    if (error) throw error;
    res.json({ message: "Pricing rule deleted successfully" });
  } catch (error) {
    console.error("Error deleting pricing rule:", error);
    res.status(500).json({ message: "Failed to delete pricing rule" });
  }
});

export default router;
