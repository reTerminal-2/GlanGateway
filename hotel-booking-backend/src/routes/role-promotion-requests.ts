import express, { Request, Response } from "express";
import multer from "multer";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";
import imageService from "../services/imageService";
import crypto from "crypto";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const uploadFields = [
  { name: 'dtiPermit', maxCount: 1 },
  { name: 'municipalEngineeringCert', maxCount: 1 },
  { name: 'municipalHealthCert', maxCount: 1 },
  { name: 'menroCert', maxCount: 1 },
  { name: 'bfpPermit', maxCount: 1 },
  { name: 'businessPermit', maxCount: 1 },
  { name: 'nationalId', maxCount: 1 },
];

// GET requests - for users returns their own requests, for admins returns all requests
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    // Check if user is admin
    const { data: user, error: userError } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    if (userError) throw userError;
    const isAdmin = user?.role === 'admin';

    let requestsData;
    if (isAdmin) {
      const status = req.query.status as string;
      let query = supabaseAdmin.from("role_promotion_requests").select("*");
      if (status) {
        query = query.eq("status", status);
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      requestsData = data || [];
    } else {
      const { data, error } = await supabaseAdmin
        .from("role_promotion_requests")
        .select("*")
        .eq("user_id", req.userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      requestsData = data || [];
    }

    // Populate user info manually
    const requests = [];
    for (const reqObj of requestsData) {
      const { data: u } = await supabaseAdmin
        .from("users")
        .select("first_name, last_name, email, image")
        .eq("id", reqObj.user_id)
        .maybeSingle();

      requests.push({
        ...reqObj,
        _id: reqObj.id,
        userId: u ? {
          firstName: u.first_name,
          lastName: u.last_name,
          email: u.email,
          profileImage: u.image
        } : null
      });
    }

    res.json({ data: requests, pagination: { total: requests.length, page: 1, pages: 1 } });
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

// POST create request with multiple file uploads - for users to submit
router.post(
  "/",
  verifyToken,
  upload.fields(uploadFields),
  async (req: Request, res: Response) => {
    try {
      console.log("=== Resort Owner Application Submission Started ===");
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files || Object.keys(files).length === 0) {
        return res.status(400).json({ message: "No files uploaded" });
      }

      // Validate required files
      const requiredFields = ['dtiPermit', 'municipalEngineeringCert', 'municipalHealthCert', 
                             'menroCert', 'bfpPermit', 'businessPermit', 'nationalId'];
      
      const missingFiles = requiredFields.filter(fieldName => !files[fieldName] || files[fieldName].length === 0);
      if (missingFiles.length > 0) {
        console.log("Missing files:", missingFiles);
        return res.status(400).json({ 
          message: "Missing required files", 
          missingFiles 
        });
      }

      const documents: Record<string, string> = {};

      for (const fieldName of requiredFields) {
        const file = files[fieldName][0];
        console.log(`Processing file: ${fieldName}, original name: ${file.originalname}`);

        const urls = await imageService.saveImages([{
          originalname: file.originalname,
          buffer: file.buffer,
          mimetype: file.mimetype,
          size: file.size,
          fieldname: file.fieldname,
          encoding: file.encoding
        }]);

        if (urls && urls.length > 0) {
          documents[fieldName] = urls[0];
          console.log(`Uploaded ${fieldName} successfully: ${urls[0]}`);
        } else {
          throw new Error(`Failed to upload file for ${fieldName}`);
        }
      }

      const { data: newRequest, error: insertError } = await supabaseAdmin
        .from("role_promotion_requests")
        .insert({
          user_id: req.userId,
          documents,
          status: 'pending'
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      res.status(201).json({ 
        message: "Resort owner application submitted successfully", 
        request: {
          ...newRequest,
          _id: newRequest.id
        }
      });
    } catch (error) {
      console.error("Error creating promotion request:", error);
      res.status(500).json({ message: "Failed to submit application", error: String(error) });
    }
  }
);

// GET pending requests - admin only
router.get("/pending", verifyToken, async (req: Request, res: Response) => {
  try {
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    if (user?.role !== 'admin') {
      return res.status(403).json({ message: "Access denied. Admin role required." });
    }

    const { data: pendingRequestsData, error } = await supabaseAdmin
      .from("role_promotion_requests")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const pendingRequests = [];
    for (const reqObj of pendingRequestsData || []) {
      const { data: u } = await supabaseAdmin
        .from("users")
        .select("first_name, last_name, email, image")
        .eq("id", reqObj.user_id)
        .maybeSingle();

      pendingRequests.push({
        ...reqObj,
        _id: reqObj.id,
        userId: u ? {
          firstName: u.first_name,
          lastName: u.last_name,
          email: u.email,
          profileImage: u.image
        } : null
      });
    }

    res.json({ requests: pendingRequests });
  } catch (error) {
    console.error("Error fetching pending requests:", error);
    res.status(500).json({ message: "Failed to fetch pending requests" });
  }
});

// GET stats - admin only
router.get("/stats", verifyToken, async (req: Request, res: Response) => {
  try {
    const { data: pending } = await supabaseAdmin.from("role_promotion_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
    const { data: approved } = await supabaseAdmin.from("role_promotion_requests").select("id", { count: "exact", head: true }).eq("status", "approved");
    const { data: declined } = await supabaseAdmin.from("role_promotion_requests").select("id", { count: "exact", head: true }).eq("status", "declined");

    res.json({
      pending: pending || 0,
      approved: approved || 0,
      declined: declined || 0
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    res.status(500).json({ message: "Failed to fetch stats" });
  }
});

// GET application details for review - admin only
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data: request, error } = await supabaseAdmin
      .from("role_promotion_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !request) {
      return res.status(404).json({ message: "Application not found" });
    }

    const { data: u } = await supabaseAdmin
      .from("users")
      .select("first_name, last_name, email, phone")
      .eq("id", request.user_id)
      .maybeSingle();

    const { data: reviewer } = request.reviewed_by ? await supabaseAdmin
      .from("users")
      .select("first_name, last_name, email")
      .eq("id", request.reviewed_by)
      .maybeSingle() : { data: null };

    res.json({
      request: {
        ...request,
        _id: request.id,
        userId: u ? {
          firstName: u.first_name,
          lastName: u.last_name,
          email: u.email,
          phone: u.phone
        } : null,
        reviewedBy: reviewer ? {
          firstName: reviewer.first_name,
          lastName: reviewer.last_name,
          email: reviewer.email
        } : null
      }
    });
  } catch (error) {
    console.error("Error fetching application details:", error);
    res.status(500).json({ message: "Failed to fetch application details" });
  }
});

// PUT update document review status - admin only
router.put("/:id/review-document", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { documentType, reviewed, notes } = req.body;
    
    const { data: request, error: fetchError } = await supabaseAdmin
      .from("role_promotion_requests")
      .select("review_status, admin_notes")
      .eq("id", id)
      .single();

    if (fetchError || !request) {
      return res.status(404).json({ message: "Application not found" });
    }

    const updatedReviewStatus = {
      ...(request.review_status as Record<string, boolean>),
      [documentType]: reviewed
    };

    const { error: updateError } = await supabaseAdmin
      .from("role_promotion_requests")
      .update({
        review_status: updatedReviewStatus,
        status: 'under_review',
        admin_notes: notes || request.admin_notes
      })
      .eq("id", id);

    if (updateError) throw updateError;

    res.json({ message: "Document review status updated successfully" });
  } catch (error) {
    console.error("Error updating document review:", error);
    res.status(500).json({ message: "Failed to update document review status" });
  }
});

// POST approve request - admin only
router.post("/:id/approve", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data: request, error: fetchError } = await supabaseAdmin
      .from("role_promotion_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !request) {
      return res.status(404).json({ message: "Application not found" });
    }
    
    if (request.status === 'approved') {
      return res.status(400).json({ message: "Application already approved" });
    }

    // Update the request status
    const { error: updateError } = await supabaseAdmin
      .from("role_promotion_requests")
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.userId
      })
      .eq("id", id);

    if (updateError) throw updateError;

    // Update the user's role to resort_owner
    const { data: updatedUser, error: userError } = await supabaseAdmin
      .from("users")
      .update({ role: "resort_owner" })
      .eq("id", request.user_id)
      .select()
      .single();

    if (userError) throw userError;

    res.json({ 
      message: "Application approved and user promoted to resort owner successfully",
      user: updatedUser
    });
  } catch (error) {
    console.error("Error approving application:", error);
    res.status(500).json({ message: "Failed to approve application" });
  }
});

// POST decline request - admin only
router.post("/:id/decline", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    
    const { data: request, error: fetchError } = await supabaseAdmin
      .from("role_promotion_requests")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !request) {
      return res.status(404).json({ message: "Request not found" });
    }
    if (request.status !== 'pending') {
      return res.status(400).json({ message: "Request is not pending" });
    }

    const { error: updateError } = await supabaseAdmin
      .from("role_promotion_requests")
      .update({
        status: 'declined',
        reviewed_at: new Date().toISOString(),
        reviewed_by: req.userId,
        rejection_reason: rejectionReason
      })
      .eq("id", id);

    if (updateError) throw updateError;

    res.json({ message: "Request declined successfully" });
  } catch (error) {
    console.error("Error declining request:", error);
    res.status(500).json({ message: "Failed to decline request" });
  }
});

// DELETE request - admin only
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = await supabaseAdmin
      .from("role_promotion_requests")
      .delete()
      .eq("id", id);

    if (error) {
      return res.status(404).json({ message: "Request not found" });
    }

    res.json({ message: "Request deleted successfully" });
  } catch (error) {
    console.error("Error deleting request:", error);
    res.status(500).json({ message: "Failed to delete request" });
  }
});

export default router;
