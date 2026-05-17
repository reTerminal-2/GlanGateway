import express, { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import IdentityVerification from "../models/identity-verification";
import Booking from "../models/booking";
import User from "../models/user";
import { supabase } from "../core/supabase";
import crypto from "crypto";
import { UserRole } from "../types";

const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  let token: string | undefined;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    token = req.cookies?.session_id;
  }

  if (!token) {
    return res.status(401).json({ message: "unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY as string);
    req.userId = (decoded as JwtPayload).userId;
    next();
  } catch (error) {
    return res.status(401).json({ message: "unauthorized" });
  }
};

const verifyAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || (user.role !== "admin" && user.role !== "superAdmin")) {
      return res.status(403).json({ message: "Admin privileges required" });
    }
    next();
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify admin status" });
  }
};

const router = express.Router();

/**
 * POST /api/identity-verification/submit
 * Submit identity verification documents for user account
 */
router.post("/submit", verifyToken, async (req: Request, res: Response) => {
  try {
    const { documentType, idNumber, documentImageUrl } = req.body;
    const userId = req.userId;

    if (!documentType || !idNumber || !documentImageUrl) {
      return res.status(400).json({ 
        message: "Document type, ID number, and document image are required" 
      });
    }

    const validTypes = ["passport", "drivers_license", "national_id", "other"];
    if (!validTypes.includes(documentType)) {
      return res.status(400).json({ message: "Invalid document type" });
    }

    // Check if pending verification already exists
    const existingPending = await IdentityVerification.findOne({
      guestId: userId,
      verificationStatus: { $in: ["pending", "manual_review"] }
    });

    if (existingPending) {
      return res.status(409).json({ 
        message: "You already have a pending verification request",
        verification: existingPending
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const verification = new IdentityVerification({
      guestId: userId,
      guestName: `${user.firstName} ${user.lastName}`,
      guestEmail: user.email,
      idType: documentType,
      idNumber,
      idImageUrl: documentImageUrl,
      verificationStatus: "pending",
      nameMatchScore: 0,
      nameMatchResult: "no_match",
      riskFlags: [],
      isFlaggedForFraud: false,
      autoConfirmed: false,
    });

    await verification.save();

    res.status(201).json({
      message: "Verification request submitted successfully",
      verification: {
        id: verification._id,
        status: verification.verificationStatus,
        documentType: verification.idType,
        createdAt: verification.createdAt
      }
    });
  } catch (error) {
    console.error("Error submitting identity verification:", error);
    res.status(500).json({ message: "Failed to submit verification" });
  }
});

/**
 * GET /api/identity-verification/status
 * Get current user's verification status
 */
router.get("/status", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    const latestVerification = await IdentityVerification.findOne({ guestId: userId })
      .sort({ createdAt: -1 });

    const user = await User.findById(userId);

    res.json({
      accountVerified: user?.accountVerified || false,
      accountVerifiedAt: user?.accountVerifiedAt,
      latestVerification: latestVerification ? {
        id: latestVerification._id,
        status: latestVerification.verificationStatus,
        documentType: latestVerification.idType,
        createdAt: latestVerification.createdAt,
        reviewedAt: latestVerification.reviewedAt,
        rejectionReason: latestVerification.fraudReason
      } : null
    });
  } catch (error) {
    console.error("Error fetching verification status:", error);
    res.status(500).json({ message: "Failed to fetch verification status" });
  }
});

/**
 * GET /api/identity-verification/pending
 * Admin: Get all pending identity verifications
 */
router.get("/pending", verifyToken, verifyAdmin, async (req: Request, res: Response) => {
  try {
    const pendingVerifications = await IdentityVerification.find({
      verificationStatus: { $in: ["pending", "manual_review"] }
    }).sort({ createdAt: 1 });

    res.json({
      count: pendingVerifications.length,
      verifications: pendingVerifications
    });
  } catch (error) {
    console.error("Error fetching pending verifications:", error);
    res.status(500).json({ message: "Failed to fetch pending verifications" });
  }
});

/**
 * POST /api/identity-verification/:id/verify
 * Admin: Approve or reject identity verification
 */
router.post("/:id/verify", verifyToken, verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, notes, rejectionReason } = req.body;
    const adminId = req.userId;

    if (!["verified", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'verified' or 'rejected'" });
    }

    const verification = await IdentityVerification.findById(id);
    if (!verification) {
      return res.status(404).json({ message: "Verification request not found" });
    }

    if (verification.verificationStatus === "verified" || verification.verificationStatus === "failed") {
      return res.status(400).json({ message: "This verification has already been processed" });
    }

    verification.verificationStatus = status === "verified" ? "verified" : "failed";
    verification.reviewedBy = adminId;
    verification.reviewedAt = new Date();
    verification.reviewNote = notes;
    
    if (status === "rejected") {
      verification.isFlaggedForFraud = true;
      verification.fraudReason = rejectionReason || "Verification rejected by admin";
    } else {
      verification.isFlaggedForFraud = false;
      verification.autoConfirmed = true;
    }

    await verification.save();

    // Update user's account verification status
    await User.findByIdAndUpdate(verification.guestId, {
      accountVerified: status === "verified",
      accountVerifiedBy: adminId,
      accountVerifiedAt: new Date()
    });

    res.json({
      message: status === "verified" ? "Verification approved successfully" : "Verification rejected",
      verification: {
        id: verification._id,
        status: verification.verificationStatus,
        reviewedAt: verification.reviewedAt
      }
    });
  } catch (error) {
    console.error("Error processing verification:", error);
    res.status(500).json({ message: "Failed to process verification" });
  }
});

/**
 * GET /api/identity-verification/:id
 * Admin: Get single verification details
 */
router.get("/:id", verifyToken, verifyAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const verification = await IdentityVerification.findById(id);
    
    if (!verification) {
      return res.status(404).json({ message: "Verification not found" });
    }

    res.json(verification);
  } catch (error) {
    console.error("Error fetching verification:", error);
    res.status(500).json({ message: "Failed to fetch verification" });
  }
});

/**
 * POST /api/identity-verification/submit
 * Submit ID for verification (OCR processing)
 */
router.post("/submit", verifyToken, async (req: Request, res: Response) => {
  try {
    const { bookingId, idType, idNumber, idImageUrl } = req.body;
    const guestId = req.userId;

    if (!bookingId || !idType || !idNumber || !idImageUrl) {
      return res.status(400).json({ 
        message: "Booking ID, ID type, ID number, and ID image are required" 
      });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check if verification already exists
    const existingVerification = await IdentityVerification.findOne({ bookingId });
    if (existingVerification) {
      return res.status(409).json({ 
        message: "Verification already submitted for this booking",
        existingVerification 
      });
    }

    // Simulate OCR processing - extract text from ID
    // In production, integrate with OCR service like Google Vision API
    const guestName = `${booking.firstName} ${booking.lastName}`;
    
    // Mock OCR extraction (replace with actual OCR service)
    const ocrExtractedName = guestName; // Simulate name extraction
    const ocrConfidenceScore = 85; // Simulated confidence

    // Calculate name match score
    const nameMatch = calculateNameMatch(guestName, ocrExtractedName);

    // Determine verification status based on match
    let verificationStatus: "verified" | "high_risk" | "manual_review" | "pending" = "pending";
    const riskFlags: string[] = [];

    if (nameMatch.result === "no_match") {
      verificationStatus = "high_risk";
      riskFlags.push("Name on ID does not match booking name");
    } else if (nameMatch.result === "partial_match") {
      verificationStatus = "manual_review";
      riskFlags.push("Name partially matches - requires manual review");
    } else if (ocrConfidenceScore < 70) {
      verificationStatus = "manual_review";
      riskFlags.push("Low OCR confidence score");
    } else {
      verificationStatus = "verified";
    }

    // Create verification record
    const verification = new IdentityVerification({
      bookingId,
      hotelId: booking.hotelId.toString(),
      guestId: guestId || "",
      guestName,
      guestEmail: booking.email,
      idType,
      idNumber,
      idImageUrl,
      ocrExtractedName,
      ocrConfidenceScore,
      verificationStatus,
      nameMatchScore: nameMatch.score,
      nameMatchResult: nameMatch.result,
      riskFlags,
      isFlaggedForFraud: verificationStatus === "high_risk",
      fraudReason: verificationStatus === "high_risk" ? "Name mismatch between ID and booking" : undefined,
      autoConfirmed: verificationStatus === "verified",
    });

    await verification.save();

    // If verified, update booking status
    if (verificationStatus === "verified") {
      await Booking.findByIdAndUpdate(bookingId, {
        verifiedByOwner: true,
        ownerVerifiedAt: new Date(),
      });
    }

    res.status(201).json({
      message: verificationStatus === "high_risk" 
        ? "Verification failed - name mismatch detected" 
        : verificationStatus === "manual_review"
        ? "Verification requires manual review"
        : "Verification successful",
      verification: {
        id: verification._id,
        bookingId,
        status: verificationStatus,
        nameMatchScore: verification.nameMatchScore,
        riskFlags: verification.riskFlags,
        isFlaggedForFraud: verification.isFlaggedForFraud,
      },
    });
  } catch (error) {
    console.error("Error submitting identity verification:", error);
    res.status(500).json({ message: "Failed to submit verification" });
  }
});

/**
 * GET /api/identity-verification/booking/:bookingId
 * Get verification status for a booking
 */
router.get("/booking/:bookingId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;

    const verification = await IdentityVerification.findOne({ bookingId });

    if (!verification) {
      return res.json({ 
        hasVerification: false,
        message: "No verification submitted" 
      });
    }

    res.json({
      hasVerification: true,
      verification: {
        id: verification._id,
        status: verification.verificationStatus,
        idType: verification.idType,
        nameMatchScore: verification.nameMatchScore,
        nameMatchResult: verification.nameMatchResult,
        riskFlags: verification.riskFlags,
        isFlaggedForFraud: verification.isFlaggedForFraud,
        reviewedAt: verification.reviewedAt,
      },
    });
  } catch (error) {
    console.error("Error fetching verification:", error);
    res.status(500).json({ message: "Failed to fetch verification" });
  }
});

/**
 * GET /api/identity-verification/hotel/:hotelId
 * Get all verifications for a hotel (admin view)
 */
router.get("/hotel/:hotelId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { hotelId } = req.params;
    const { status, flagged } = req.query;

    const query: any = { hotelId };
    if (status) query.verificationStatus = status;
    if (flagged === "true") query.isFlaggedForFraud = true;

    const verifications = await IdentityVerification.find(query)
      .sort({ createdAt: -1 });

    const summary = {
      total: verifications.length,
      verified: verifications.filter(v => v.verificationStatus === "verified").length,
      pending: verifications.filter(v => v.verificationStatus === "pending").length,
      manualReview: verifications.filter(v => v.verificationStatus === "manual_review").length,
      highRisk: verifications.filter(v => v.verificationStatus === "high_risk").length,
      flaggedForFraud: verifications.filter(v => v.isFlaggedForFraud).length,
    };

    res.json({ verifications, summary });
  } catch (error) {
    console.error("Error fetching hotel verifications:", error);
    res.status(500).json({ message: "Failed to fetch verifications" });
  }
});

/**
 * POST /api/identity-verification/:verificationId/review
 * Manual review of a verification (admin)
 */
router.post("/:verificationId/review", verifyToken, async (req: Request, res: Response) => {
  try {
    const { verificationId } = req.params;
    const { approved, reviewNote } = req.body;
    const reviewedBy = req.userId;

    const verification = await IdentityVerification.findById(verificationId);
    if (!verification) {
      return res.status(404).json({ message: "Verification not found" });
    }

    verification.reviewedBy = reviewedBy;
    verification.reviewedAt = new Date();
    verification.reviewNote = reviewNote;

    if (approved) {
      verification.verificationStatus = "verified";
      verification.isFlaggedForFraud = false;
      verification.fraudReason = undefined;
      
      // Auto-confirm booking if payment is complete
      await Booking.findByIdAndUpdate(verification.bookingId, {
        verifiedByOwner: true,
        ownerVerifiedAt: new Date(),
        ownerVerificationNote: reviewNote,
      });
    } else {
      verification.verificationStatus = "failed";
      verification.isFlaggedForFraud = true;
      verification.fraudReason = reviewNote || "Failed manual review";
    }

    await verification.save();

    res.json({
      message: approved ? "Verification approved" : "Verification rejected",
      verification: {
        id: verification._id,
        status: verification.verificationStatus,
        reviewedAt: verification.reviewedAt,
      },
    });
  } catch (error) {
    console.error("Error reviewing verification:", error);
    res.status(500).json({ message: "Failed to review verification" });
  }
});

/**
 * POST /api/identity-verification/:verificationId/upload-id
 * Upload ID image to cloud storage
 */
router.post("/:verificationId/upload-id", verifyToken, async (req: Request, res: Response) => {
  try {
    const { verificationId } = req.params;
    const { imageData } = req.body; // Base64 image

    if (!imageData) {
      return res.status(400).json({ message: "Image data is required" });
    }

    // Decode Base64 string to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const fileBuffer = Buffer.from(base64Data, "base64");
    
    // Detect mime type or use default image/jpeg
    const mimeMatch = imageData.match(/^data:(image\/\w+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const ext = mimeType.split("/")[1] || "jpg";
    
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    
    console.log(`Uploading ID to Supabase bucket 'secure-documents'...`);
    const { data, error } = await supabase.storage
      .from('secure-documents')
      .upload(uniqueName, fileBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (error) {
      console.warn("⚠️ Supabase upload error:", error.message);
      throw error;
    }

    // Retrieve public URL from Supabase
    const { data: { publicUrl } } = supabase.storage
      .from('secure-documents')
      .getPublicUrl(uniqueName);

    const verification = await IdentityVerification.findById(verificationId);
    if (!verification) {
      return res.status(404).json({ message: "Verification not found" });
    }

    verification.idImageUrl = publicUrl;
    await verification.save();

    res.json({
      message: "ID uploaded successfully",
      imageUrl: publicUrl,
    });
  } catch (error) {
    console.error("Error uploading ID:", error);
    res.status(500).json({ message: "Failed to upload ID" });
  }
});

// Helper function to calculate name match
function calculateNameMatch(
  bookingName: string, 
  ocrName: string
): { score: number; result: "match" | "partial_match" | "no_match" } {
  const normalizeName = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();

  const normalizedBooking = normalizeName(bookingName);
  const normalizedOCR = normalizeName(ocrName);

  if (normalizedBooking === normalizedOCR) {
    return { score: 100, result: "match" };
  }

  if (
    normalizedBooking.includes(normalizedOCR) ||
    normalizedOCR.includes(normalizedBooking)
  ) {
    return { score: 75, result: "partial_match" };
  }

  // Calculate Levenshtein distance
  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    if (longer.length === 0) return 1.0;

    const costs = new Array();
    for (let i = 0; i <= longer.length; i++) {
      let lastValue = i;
      for (let j = 0; j <= shorter.length; j++) {
        if (i === 0) costs[j] = j;
        else {
          if (j > 0) {
            let newValue = costs[j - 1];
            if (longer.charAt(i - 1) !== shorter.charAt(j - 1))
              newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
            costs[j - 1] = lastValue;
            lastValue = newValue;
          }
        }
      }
      if (i > 0) costs[shorter.length] = lastValue;
    }
    return (longer.length - costs[shorter.length]) / longer.length;
  };

  const similarity = calculateSimilarity(normalizedBooking, normalizedOCR);
  const score = Math.round(similarity * 100);

  if (score >= 60) {
    return { score, result: "partial_match" };
  }

  return { score, result: "no_match" };
}

export default router;
