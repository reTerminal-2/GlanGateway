import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { supabase } from "../core/supabase";
import crypto from "crypto";
import { verifyToken } from "../middleware/role-based-auth";
import RolePromotionRequest from "../models/role-promotion-request";
import User from "../models/user";

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'promotion-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    try {
      // Accept only image and document files
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        console.log('Rejected file type:', file.mimetype);
        cb(new Error('Only image and PDF files are allowed'));
      }
    } catch (error) {
      console.error('Error in fileFilter:', error);
      cb(error);
    }
  }
});

const router = express.Router();

// GET requests - for users returns their own requests, for admins returns all requests
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    // Check user role by finding the user
    const user = await User.findById(req.userId);
    const isAdmin = user?.role === 'admin';
    
    let requests;
    let pagination;
    
    if (isAdmin) {
      // Admin gets all requests with pagination
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;
      
      let query: any = {};
      if (status) query.status = status;
      
      requests = await RolePromotionRequest.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("userId", "firstName lastName email profileImage");
      
      const total = await RolePromotionRequest.countDocuments(query);
      pagination = { total, page, pages: Math.ceil(total / limit) };
    } else {
      // Regular user gets only their own requests
      requests = await RolePromotionRequest.find({ userId: req.userId })
        .sort({ createdAt: -1 })
        .populate("userId", "firstName lastName email profileImage");
      pagination = { total: requests.length, page: 1, pages: 1 };
    }
    
    res.json({ data: requests, pagination });
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

// POST create request with multiple file uploads - for users to submit
router.post(
  "/",
  verifyToken,
  upload.fields([
    { name: 'dtiPermit', maxCount: 1 },
    { name: 'municipalEngineeringCert', maxCount: 1 },
    { name: 'municipalHealthCert', maxCount: 1 },
    { name: 'menroCert', maxCount: 1 },
    { name: 'bfpPermit', maxCount: 1 },
    { name: 'businessPermit', maxCount: 1 },
    { name: 'nationalId', maxCount: 1 },
  ]),
  async (req: Request, res: Response) => {
    try {
      console.log("=== Resort Owner Application Submission Started ===");
      console.log("Received resort owner application request");
      console.log("User ID from token:", req.userId);
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      console.log("Files received:", Object.keys(files || {}));

      // Validate required files
      const requiredFiles = ['dtiPermit', 'municipalEngineeringCert', 'municipalHealthCert', 
                           'menroCert', 'bfpPermit', 'businessPermit', 'nationalId'];
      
      const missingFiles = requiredFiles.filter(fieldName => !files[fieldName] || files[fieldName].length === 0);
      if (missingFiles.length > 0) {
        console.log("Missing files:", missingFiles);
        return res.status(400).json({ 
          message: "Missing required files", 
          missingFiles 
        });
      }

      // Upload files to Supabase Storage or save locally
      const documents: any = {};
      
      for (const fieldName of requiredFiles) {
        const file = files[fieldName][0];
        console.log(`Processing file: ${fieldName}, path: ${file.path}`);
        
        try {
          const ext = path.extname(file.originalname).toLowerCase();
          const uniqueName = `${crypto.randomUUID()}${ext}`;
          const fileBuffer = fs.readFileSync(file.path);
          
          console.log(`Uploading ${fieldName} to Supabase bucket 'secure-documents'...`);
          const { data, error } = await supabase.storage
            .from('secure-documents')
            .upload(uniqueName, fileBuffer, {
              contentType: file.mimetype,
              upsert: true
            });

          if (error) throw error;

          // Retrieve public URL from Supabase
          const { data: { publicUrl } } = supabase.storage
            .from('secure-documents')
            .getPublicUrl(uniqueName);

          documents[fieldName] = publicUrl;
          console.log(`Successfully uploaded ${fieldName} to Supabase Storage`);
        } catch (uploadError: any) {
          console.error(`Failed to upload ${fieldName} to Supabase:`, uploadError);
          // Fallback to local storage
          documents[fieldName] = `/uploads/${file.filename}`;
          console.log(`Saved ${fieldName} locally as fallback: ${documents[fieldName]}`);
        }
      }

      console.log("Creating role promotion request in database");
      console.log("Documents object:", JSON.stringify(documents, null, 2));
      const newRequest = new RolePromotionRequest({
        userId: req.userId,
        documents,
      });
      console.log("New request object created:", JSON.stringify(newRequest.toObject(), null, 2));

      console.log("Attempting to save to database...");
      await newRequest.save();
      console.log("Role promotion request saved successfully with ID:", newRequest._id);

      res.status(201).json({ 
        message: "Resort owner application submitted successfully", 
        request: newRequest 
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
    console.log("=== PENDING REQUESTS ENDPOINT CALLED ===");
    console.log("User ID from token:", req.userId);
    
    // Check user role by finding the user
    const user = await User.findById(req.userId);
    const isAdmin = user?.role === 'admin';
    
    console.log("User found:", user ? { id: user._id, email: user.email, role: user.role } : null);
    console.log("Is admin:", isAdmin);
    
    if (!isAdmin) {
      console.log("Access denied: User is not admin");
      return res.status(403).json({ message: "Access denied. Admin role required." });
    }
    
    console.log("Fetching pending requests...");
    const pendingRequests = await RolePromotionRequest.find({ status: 'pending' }).populate('userId', "firstName lastName email profileImage");
    
    console.log("Found pending requests:", pendingRequests.length);
    console.log("Pending requests data:", JSON.stringify(pendingRequests, null, 2));

    res.json({ requests: pendingRequests });
  } catch (error) {
    console.error("Error fetching pending requests:", error);
    res.status(500).json({ message: "Failed to fetch pending requests" });
  }
});

// GET stats - admin only
router.get("/stats", verifyToken, async (req: Request, res: Response) => {
  try {
    const pending = await RolePromotionRequest.countDocuments({ status: 'pending' });
    const approved = await RolePromotionRequest.countDocuments({ status: 'approved' });
    const declined = await RolePromotionRequest.countDocuments({ status: 'declined' });
    
    res.json({
      pending,
      approved,
      declined
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
    const request = await RolePromotionRequest.findById(id)
      .populate("userId", "firstName lastName email phone address")
      .populate("reviewedBy", "firstName lastName email");
    
    if (!request) {
      return res.status(404).json({ message: "Application not found" });
    }

    res.json({ request });
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
    
    const request = await RolePromotionRequest.findById(id);
    if (!request) {
      return res.status(404).json({ message: "Application not found" });
    }

    // Update review status for specific document
    const updateField = `reviewStatus.${documentType}`;
    await RolePromotionRequest.findByIdAndUpdate(id, {
      [updateField]: reviewed,
      status: 'under_review',
      adminNotes: notes || request.adminNotes,
    });

    res.json({ message: "Document review status updated successfully" });
  } catch (error) {
    console.error("Error updating document review:", error);
    res.status(500).json({ message: "Failed to update document review status" });
  }
});

// POST approve request - admin only
router.post("/:id/approve", verifyToken, async (req: Request, res: Response) => {
  try {
    console.log("=== APPROVE REQUEST ENDPOINT CALLED ===");
    console.log("Request ID:", req.params.id);
    console.log("User ID from token:", req.userId);
    
    const { id } = req.params;
    const request = await RolePromotionRequest.findById(id);
    if (!request) {
      console.log("Request not found");
      return res.status(404).json({ message: "Application not found" });
    }
    
    if (request.status === 'approved') {
      console.log("Request already approved");
      return res.status(400).json({ message: "Application already approved" });
    }

    console.log("Approving request for user:", request.userId);

    // Update the request status
    await RolePromotionRequest.findByIdAndUpdate(id, {
      status: 'approved',
      reviewedAt: new Date(),
      reviewedBy: req.userId
    });

    // Also update the user's role to resort_owner
    const updatedUser = await User.findByIdAndUpdate(request.userId, { role: "resort_owner" }, { new: true });
    console.log("User role updated:", updatedUser?.email, "new role:", updatedUser?.role);

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
    console.log("=== DECLINE REQUEST ENDPOINT CALLED ===");
    console.log("Request ID:", req.params.id);
    console.log("Request body:", req.body);
    console.log("User ID from token:", req.userId);
    
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const request = await RolePromotionRequest.findById(id);
    
    console.log("Found request:", request ? {
      id: request._id,
      currentStatus: request.status,
      userId: request.userId
    } : null);
    
    if (!request) {
      console.log("Request not found");
      return res.status(404).json({ message: "Request not found" });
    }
    if (request.status !== 'pending') {
      console.log("Request is not pending, current status:", request.status);
      return res.status(400).json({ message: "Request is not pending" });
    }

    console.log("Updating request status to declined...");
    const updatedRequest = await RolePromotionRequest.findByIdAndUpdate(id, {
      status: 'declined',
      reviewedAt: new Date(),
      reviewedBy: req.userId,
      rejectionReason
    }, { new: true }); // Return the updated document
    
    console.log("Updated request:", {
      id: updatedRequest._id,
      newStatus: updatedRequest.status,
      reviewedAt: updatedRequest.reviewedAt,
      reviewedBy: updatedRequest.reviewedBy,
      rejectionReason: updatedRequest.rejectionReason
    });

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
    const request = await RolePromotionRequest.findByIdAndDelete(id);
    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    res.json({ message: "Request deleted successfully" });
  } catch (error) {
    console.error("Error deleting request:", error);
    res.status(500).json({ message: "Failed to delete request" });
  }
});

export default router;
