import express, { Request, Response } from "express";
import verifyToken from "../middleware/auth";
import { param, validationResult, body } from "express-validator";
import { supabaseAdmin } from "../core/supabase";

const router = express.Router();

// Get all pending resorts (for admin approval)
router.get("/pending", verifyToken, async (req: Request, res: Response) => {
  try {
    // Verify admin
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    if (!user || !["admin", "superAdmin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // Fetch pending hotels (status = 'pending' or is_approved = false)
    const { data: pendingResorts, count, error } = await supabaseAdmin
      .from("hotels")
      .select("*, users!hotels_user_id_fkey(first_name, last_name, email)", { count: "exact" })
      .or("status.eq.pending,is_approved.eq.false")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) {
      console.error("❌ Error fetching pending resorts:", error);
      
      // Fallback: try without the join if the FK doesn't exist
      const { data: fallbackResorts, count: fallbackCount, error: fallbackError } = await supabaseAdmin
        .from("hotels")
        .select("*", { count: "exact" })
        .or("status.eq.pending,is_approved.eq.false")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (fallbackError) {
        return res.status(500).json({ message: "Error fetching pending resorts" });
      }

      // Fetch user info separately for each resort
      const resortsWithOwners = await Promise.all(
        (fallbackResorts || []).map(async (resort: any) => {
          const { data: owner } = await supabaseAdmin
            .from("users")
            .select("first_name, last_name, email")
            .eq("id", resort.user_id)
            .maybeSingle();

          return {
            ...resort,
            _id: resort.id,
            userId: resort.user_id,
            type: resort.types,
            isApproved: resort.is_approved,
            owner: owner ? {
              firstName: owner.first_name,
              lastName: owner.last_name,
              email: owner.email
            } : null
          };
        })
      );

      return res.json({
        data: resortsWithOwners,
        pagination: {
          total: fallbackCount || 0,
          page,
          pages: Math.ceil((fallbackCount || 0) / limit),
        },
      });
    }

    // Format the response for the frontend
    const formattedResorts = (pendingResorts || []).map((resort: any) => ({
      ...resort,
      _id: resort.id,
      userId: resort.user_id,
      type: resort.types,
      isApproved: resort.is_approved,
      owner: resort.users ? {
        firstName: resort.users.first_name,
        lastName: resort.users.last_name,
        email: resort.users.email
      } : null
    }));

    const total = count || 0;
    res.json({
      data: formattedResorts,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching pending resorts:", error);
    res.status(500).json({ message: "Error fetching pending resorts" });
  }
});

// Get all resorts (including unapproved) for admin
router.get("/all", verifyToken, async (req: Request, res: Response) => {
  try {
    // Verify admin
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    if (!user || !["admin", "superAdmin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const status = req.query.status as string;

    let queryBuilder = supabaseAdmin
      .from("hotels")
      .select("*", { count: "exact" });

    if (status === "approved") {
      queryBuilder = queryBuilder.eq("status", "approved");
    } else if (status === "pending") {
      queryBuilder = queryBuilder.eq("status", "pending");
    } else if (status === "declined") {
      queryBuilder = queryBuilder.eq("status", "declined");
    }

    queryBuilder = queryBuilder
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data: resorts, count, error } = await queryBuilder;

    if (error) {
      console.error("❌ Error fetching all resorts:", error);
      return res.status(500).json({ message: "Error fetching resorts" });
    }

    // Fetch owner info for each resort
    const resortsWithOwners = await Promise.all(
      (resorts || []).map(async (resort: any) => {
        const { data: owner } = await supabaseAdmin
          .from("users")
          .select("first_name, last_name, email")
          .eq("id", resort.user_id)
          .maybeSingle();

        return {
          ...resort,
          _id: resort.id,
          userId: resort.user_id,
          type: resort.types,
          isApproved: resort.is_approved,
          owner: owner ? {
            firstName: owner.first_name,
            lastName: owner.last_name,
            email: owner.email
          } : null
        };
      })
    );

    const total = count || 0;
    res.json({
      data: resortsWithOwners,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching all resorts:", error);
    res.status(500).json({ message: "Error fetching resorts" });
  }
});

// Approve a resort
router.post(
  "/:resortId/approve",
  verifyToken,
  [param("resortId").notEmpty().withMessage("Resort ID is required")],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Verify admin
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", req.userId)
        .maybeSingle();

      if (!user || !["admin", "superAdmin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      // Find the resort
      const { data: resort, error: findError } = await supabaseAdmin
        .from("hotels")
        .select("*")
        .eq("id", req.params.resortId)
        .maybeSingle();

      if (findError || !resort) {
        return res.status(404).json({ message: "Resort not found" });
      }

      if (resort.is_approved === true && resort.status === "approved") {
        return res.status(400).json({ message: "Resort is already approved" });
      }

      // Update resort with approval
      const { error: updateError } = await supabaseAdmin
        .from("hotels")
        .update({
          is_approved: true,
          status: "approved",
          approved_by: req.userId,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq("id", req.params.resortId);

      if (updateError) {
        console.error("❌ Approve update error:", updateError);
        return res.status(500).json({ message: "Error approving resort" });
      }

      // Get resort owner details
      const { data: resortOwner } = await supabaseAdmin
        .from("users")
        .select("first_name, last_name")
        .eq("id", resort.user_id)
        .maybeSingle();

      res.json({
        message: "Resort approved successfully",
        resort: {
          id: resort.id,
          _id: resort.id,
          name: resort.name,
          owner: resortOwner
            ? `${resortOwner.first_name} ${resortOwner.last_name}`
            : "Unknown",
        },
      });
    } catch (error) {
      console.error("Error approving resort:", error);
      res.status(500).json({ message: "Error approving resort" });
    }
  }
);

// Reject a resort
router.post(
  "/:resortId/reject",
  verifyToken,
  [
    param("resortId").notEmpty().withMessage("Resort ID is required"),
    body("rejectionReason").notEmpty().withMessage("Rejection reason is required"),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      // Verify admin
      const { data: user } = await supabaseAdmin
        .from("users")
        .select("role")
        .eq("id", req.userId)
        .maybeSingle();

      if (!user || !["admin", "superAdmin"].includes(user.role)) {
        return res.status(403).json({ message: "Access denied. Admin only." });
      }

      // Find the resort
      const { data: resort, error: findError } = await supabaseAdmin
        .from("hotels")
        .select("*")
        .eq("id", req.params.resortId)
        .maybeSingle();

      if (findError || !resort) {
        return res.status(404).json({ message: "Resort not found" });
      }

      const { rejectionReason } = req.body;

      // Update resort with rejection
      const { error: updateError } = await supabaseAdmin
        .from("hotels")
        .update({
          is_approved: false,
          status: "declined",
          approved_by: null,
          approved_at: null,
          rejection_reason: rejectionReason,
        })
        .eq("id", req.params.resortId);

      if (updateError) {
        console.error("❌ Reject update error:", updateError);
        return res.status(500).json({ message: "Error rejecting resort" });
      }

      // Get resort owner details
      const { data: resortOwner } = await supabaseAdmin
        .from("users")
        .select("first_name, last_name")
        .eq("id", resort.user_id)
        .maybeSingle();

      res.json({
        message: "Resort rejected successfully",
        resort: {
          id: resort.id,
          _id: resort.id,
          name: resort.name,
          owner: resortOwner
            ? `${resortOwner.first_name} ${resortOwner.last_name}`
            : "Unknown",
          rejectionReason,
        },
      });
    } catch (error) {
      console.error("Error rejecting resort:", error);
      res.status(500).json({ message: "Error rejecting resort" });
    }
  }
);

// Get resort approval statistics
router.get("/stats", verifyToken, async (req: Request, res: Response) => {
  try {
    // Verify admin
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    if (!user || !["admin", "superAdmin"].includes(user.role)) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { count: totalResorts } = await supabaseAdmin
      .from("hotels")
      .select("*", { count: "exact", head: true });

    const { count: approvedResorts } = await supabaseAdmin
      .from("hotels")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");

    const { count: pendingResorts } = await supabaseAdmin
      .from("hotels")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const total = totalResorts || 0;
    const approved = approvedResorts || 0;
    const pending = pendingResorts || 0;

    res.json({
      total,
      approved,
      pending,
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
    });
  } catch (error) {
    console.error("Error fetching approval stats:", error);
    res.status(500).json({ message: "Error fetching approval statistics" });
  }
});

export default router;
