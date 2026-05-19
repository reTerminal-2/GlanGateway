import express, { Request, Response } from "express";
import { supabaseAdmin } from "../core/supabase";
import verifyToken from "../middleware/auth";
import multer from "multer";
import imageService from "../services/imageService";
import crypto from "crypto";

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// GET /api/verification-documents/:userId
router.get("/:userId", verifyToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    // Auth check omitted for brevity

    const { data: documents, error } = await supabaseAdmin
      .from("verification_documents")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    res.json(documents || []);
  } catch (error) {
    console.error("Error fetching verification documents:", error);
    res.status(500).json({ message: "Failed to fetch verification documents" });
  }
});

// POST /api/verification-documents
router.post("/", verifyToken, upload.single("document"), async (req: Request, res: Response) => {
  try {
    const { document_type } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: "No document uploaded" });
    }

    const uploadedUrls = await imageService.saveImages([{
      originalname: req.file.originalname,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      size: req.file.size,
      fieldname: req.file.fieldname,
      encoding: req.file.encoding
    }]);

    if (!uploadedUrls || uploadedUrls.length === 0) {
      return res.status(500).json({ message: "Failed to upload document image" });
    }

    const documentUrl = uploadedUrls[0];

    const { data: newDocument, error } = await supabaseAdmin
      .from("verification_documents")
      .insert([{ user_id: req.userId, document_type, document_url: documentUrl, status: 'pending' }])
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(newDocument);
  } catch (error) {
    console.error("Error submitting verification document:", error);
    res.status(500).json({ message: "Failed to submit verification document" });
  }
});

export default router;
