import express, { Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import verifyToken from "../middleware/auth";
import imageService from "../services/imageService";
import { supabaseAdmin } from "../core/supabase";

const router = express.Router();

// Ensure memory storage is used for serverless deployments
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
});

// The fields expected from the frontend
const uploadFields = [
  { name: "dtiPermit", maxCount: 1 },
  { name: "municipalEngineeringCert", maxCount: 1 },
  { name: "municipalHealthCert", maxCount: 1 },
  { name: "menroCert", maxCount: 1 },
  { name: "bfpPermit", maxCount: 1 },
  { name: "businessPermit", maxCount: 1 },
  { name: "nationalId", maxCount: 1 }
];

/**
 * POST /api/resort-owner-applications
 * Submit a new resort owner application with required documents
 */
router.post(
  "/",
  verifyToken,
  upload.fields(uploadFields),
  async (req: Request, res: Response) => {
    try {
      console.log('📋 Received Resort Owner Application:', {
        userId: req.userId,
      });

      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      
      if (!files || Object.keys(files).length === 0) {
        return res.status(400).json({ 
          message: 'No documents uploaded',
          details: 'Please upload at least some required documents'
        });
      }

      const documentUrls: Record<string, string | null> = {
        dtiPermit: null,
        municipalEngineeringCert: null,
        municipalHealthCert: null,
        menroCert: null,
        bfpPermit: null,
        businessPermit: null,
        nationalId: null
      };

      // Process and upload each file to Supabase using ImageService
      for (const field of uploadFields) {
        const fileArray = files[field.name];
        if (fileArray && fileArray.length > 0) {
          const file = fileArray[0];
          try {
            console.log(`📤 Processing document ${field.name}...`);
            // imageService.saveImages accepts an array of files
            const uploadedUrls = await imageService.saveImages([{
              originalname: file.originalname,
              buffer: file.buffer,
              mimetype: file.mimetype,
              size: file.size,
              fieldname: file.fieldname,
              encoding: file.encoding
            }]);
            
            if (uploadedUrls && uploadedUrls.length > 0) {
              documentUrls[field.name] = uploadedUrls[0];
            }
          } catch (uploadError) {
            console.error(`❌ Failed to upload ${field.name}:`, uploadError);
            // We could optionally throw here to fail the whole request
          }
        }
      }

      // Check if user already has a pending application
      const { data: existingApp } = await supabaseAdmin
        .from('resort_owner_applications')
        .select('id')
        .eq('user_id', req.userId)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingApp) {
        return res.status(400).json({
          message: 'You already have a pending application. Please wait for review.'
        });
      }

      const applicationId = crypto.randomUUID();
      
      // Save the application record to Supabase
      const { error: insertError } = await supabaseAdmin
        .from('resort_owner_applications')
        .insert({
          id: applicationId,
          user_id: req.userId,
          status: 'pending',
          dti_permit_url: documentUrls.dtiPermit,
          municipal_engineering_cert_url: documentUrls.municipalEngineeringCert,
          municipal_health_cert_url: documentUrls.municipalHealthCert,
          menro_cert_url: documentUrls.menroCert,
          bfp_permit_url: documentUrls.bfpPermit,
          business_permit_url: documentUrls.businessPermit,
          national_id_url: documentUrls.nationalId,
          submitted_at: new Date().toISOString()
        });

      if (insertError) {
        console.error("❌ Error inserting application into Supabase:", insertError);
        throw new Error(`Failed to save application: ${insertError.message}`);
      }

      res.status(201).json({
        message: "Application submitted successfully",
        applicationId,
      });

    } catch (error) {
      console.error("❌ Error submitting application:", error);
      res.status(500).json({
        message: "Error submitting application. Please try again later."
      });
    }
  }
);

export default router;
