import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";

const router = express.Router();

// Middleware to verify the requesting user is an Admin or Super Admin
const verifyAdminAccess = async (req: Request, res: Response, next: any) => {
  try {
    const { data: user, error } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    if (error || !user || (user.role !== "admin" && user.role !== "superAdmin")) {
      return res.status(403).json({ message: "Access denied. Admin privilege required." });
    }
    next();
  } catch (error) {
    console.error("Admin verification error:", error);
    res.status(500).json({ message: "Internal server error during authorization checks." });
  }
};

// Helper function to map database report object to frontend CamelCase structure
const mapReportToFrontend = (report: any, reporter: any, resolver: any) => {
  return {
    _id: report.id,
    reporterId: reporter ? {
      _id: reporter.id,
      firstName: reporter.first_name,
      lastName: reporter.last_name,
      email: reporter.email
    } : null,
    reportedItemId: report.reported_item_id,
    reportedItemType: report.reported_item_type,
    reason: report.reason,
    description: report.description,
    status: report.status || "pending",
    priority: report.priority || "medium",
    adminNotes: report.admin_notes || "",
    createdAt: report.created_at,
    updatedAt: report.updated_at,
    resolvedAt: report.resolved_at,
    resolvedBy: resolver ? {
      _id: resolver.id,
      firstName: resolver.first_name,
      lastName: resolver.last_name,
      email: resolver.email
    } : null
  };
};

// POST /api/reports - Create a report
router.post("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const { reportedItemId, reportedItemType, reason, description, priority } = req.body;

    if (!reportedItemId || !reportedItemType || !reason || !description) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    const { data: newReport, error } = await supabaseAdmin
      .from("reports")
      .insert({
        reporter_id: req.userId,
        reported_item_id: reportedItemId,
        reported_item_type: reportedItemType,
        reason,
        description,
        priority: priority || "medium",
        status: "pending"
      })
      .select()
      .single();

    if (error) throw error;

    // Fetch reporter profile
    const { data: reporter } = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", req.userId)
      .maybeSingle();

    res.status(201).json(mapReportToFrontend(newReport, reporter, null));
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({ message: "Failed to create report." });
  }
});

// GET /api/reports/my-reports - Fetch reports submitted by the logged in user
router.get("/my-reports", verifyToken, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("reports")
      .select("*", { count: "exact" })
      .eq("reporter_id", req.userId);

    if (status) {
      query = query.eq("status", status);
    }

    const { data: reports, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Map profiles for each report
    const formattedReports = [];
    for (const report of reports || []) {
      const { data: reporter } = await supabaseAdmin
        .from("users")
        .select("id, first_name, last_name, email")
        .eq("id", report.reporter_id)
        .maybeSingle();

      const { data: resolver } = report.resolved_by ? await supabaseAdmin
        .from("users")
        .select("id, first_name, last_name, email")
        .eq("id", report.resolved_by)
        .maybeSingle() : { data: null };

      formattedReports.push(mapReportToFrontend(report, reporter, resolver));
    }

    res.json({
      data: formattedReports,
      pagination: {
        total: count || 0,
        page,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching user reports:", error);
    res.status(500).json({ message: "Failed to fetch user reports." });
  }
});

// GET /api/reports - Fetch all reports (admin only)
router.get("/", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const status = req.query.status as string;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from("reports")
      .select("*", { count: "exact" });

    if (status) {
      query = query.eq("status", status);
    }

    const { data: reports, count, error } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    const formattedReports = [];
    for (const report of reports || []) {
      const { data: reporter } = await supabaseAdmin
        .from("users")
        .select("id, first_name, last_name, email")
        .eq("id", report.reporter_id)
        .maybeSingle();

      const { data: resolver } = report.resolved_by ? await supabaseAdmin
        .from("users")
        .select("id, first_name, last_name, email")
        .eq("id", report.resolved_by)
        .maybeSingle() : { data: null };

      formattedReports.push(mapReportToFrontend(report, reporter, resolver));
    }

    res.json({
      data: formattedReports,
      pagination: {
        total: count || 0,
        page,
        pages: Math.ceil((count || 0) / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ message: "Failed to fetch reports." });
  }
});

// GET /api/reports/revenue/:hotelId (legacy route preserved)
router.get("/revenue/:hotelId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    
    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("created_at, total_cost")
      .eq("hotel_id", hotelId)
      .in("status", ["completed", "confirmed"]);

    if (error) throw error;

    res.json({
      totalRevenue: bookings?.reduce((sum, b) => sum + (Number(b.total_cost) || 0), 0) || 0,
      bookingsCount: bookings?.length || 0,
      data: bookings || []
    });
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).json({ message: "Failed to generate report" });
  }
});

// GET /api/reports/:reportId - Fetch a single report
router.get("/:reportId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const { data: report, error } = await supabaseAdmin
      .from("reports")
      .select("*")
      .eq("id", reportId)
      .maybeSingle();

    if (error || !report) {
      return res.status(404).json({ message: "Report not found." });
    }

    // Check permissions (only admins, or the user who created it)
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    const isAdmin = user?.role === "admin" || user?.role === "superAdmin";
    if (!isAdmin && report.reporter_id !== req.userId) {
      return res.status(403).json({ message: "Access denied." });
    }

    const { data: reporter } = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", report.reporter_id)
      .maybeSingle();

    const { data: resolver } = report.resolved_by ? await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", report.resolved_by)
      .maybeSingle() : { data: null };

    res.json(mapReportToFrontend(report, reporter, resolver));
  } catch (error) {
    console.error("Error fetching report detail:", error);
    res.status(500).json({ message: "Failed to fetch report details." });
  }
});

// PUT /api/reports/:reportId - Update a report (admin only)
router.put("/:reportId", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes } = req.body;

    const updateFields: any = {
      updated_at: new Date().toISOString()
    };

    if (status) {
      updateFields.status = status;
      if (status === "resolved" || status === "dismissed") {
        updateFields.resolved_at = new Date().toISOString();
        updateFields.resolved_by = req.userId;
      }
    }

    if (adminNotes !== undefined) {
      updateFields.admin_notes = adminNotes;
    }

    const { data: updatedReport, error } = await supabaseAdmin
      .from("reports")
      .update(updateFields)
      .eq("id", reportId)
      .select()
      .single();

    if (error) {
      console.error("Update database error:", error);
      return res.status(404).json({ message: "Report not found or failed to update." });
    }

    const { data: reporter } = await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", updatedReport.reporter_id)
      .maybeSingle();

    const { data: resolver } = updatedReport.resolved_by ? await supabaseAdmin
      .from("users")
      .select("id, first_name, last_name, email")
      .eq("id", updatedReport.resolved_by)
      .maybeSingle() : { data: null };

    res.json(mapReportToFrontend(updatedReport, reporter, resolver));
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({ message: "Failed to update report." });
  }
});

// DELETE /api/reports/:reportId - Delete a report (admin only)
router.delete("/:reportId", verifyToken, verifyAdminAccess, async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const { error } = await supabaseAdmin
      .from("reports")
      .delete()
      .eq("id", reportId);

    if (error) {
      return res.status(404).json({ message: "Report not found." });
    }

    res.json({ message: "Report deleted successfully." });
  } catch (error) {
    console.error("Error deleting report:", error);
    res.status(500).json({ message: "Failed to delete report." });
  }
});

export default router;
