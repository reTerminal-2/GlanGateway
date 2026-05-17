import express, { Request, Response } from "express";
import multer from "multer";
import imageService from "../services/imageService";
import Hotel from "../models/hotel";
import Booking from "../models/booking";
import verifyToken from "../middleware/auth";
import { body } from "express-validator";
import { HotelType } from "../types";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { supabaseAdmin } from "../core/supabase";

// Local storage configuration for fallback
const localUploadDir = path.join(__dirname, "..", "..", "uploads");

// Ensure upload directory exists
if (!fs.existsSync(localUploadDir)) {
  fs.mkdirSync(localUploadDir, { recursive: true });
}

const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, localUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${crypto.randomUUID()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const localUpload = multer({
  storage: localStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

router.post(
  "/",
  verifyToken,
  [
    body("name").notEmpty().withMessage("Name is required"),
    body("city").notEmpty().withMessage("City is required"),
    body("country").notEmpty().withMessage("Country is required"),
    body("description").notEmpty().withMessage("Description is required"),
    body("type")
      .notEmpty()
      .isArray({ min: 1 })
      .withMessage("Select at least one hotel type"),
    body("dayRate")
      .optional()
      .isNumeric()
      .withMessage("Day rate must be a number"),
    body("nightRate")
      .optional()
      .isNumeric()
      .withMessage("Night rate must be a number"),
    body("hasDayRate")
      .optional()
      .isBoolean()
      .withMessage("Has day rate must be a boolean"),
    body("hasNightRate")
      .optional()
      .isBoolean()
      .withMessage("Has night rate must be a boolean"),
    body("starRating")
      .notEmpty()
      .isNumeric()
      .withMessage("Star rating is required and must be a number"),
    body("facilities")
      .notEmpty()
      .isArray()
      .withMessage("Facilities are required"),
    body("gcashNumber")
      .optional()
      .matches(/^09\d{9}$/)
      .withMessage("GCash number must be 11 digits starting with 09 (e.g., 09XXXXXXXXX)"),
    body("downPaymentPercentage")
      .optional()
      .isInt({ min: 10, max: 100 })
      .withMessage("Down payment percentage must be between 10 and 100"),
  ],
  upload.array("imageFiles", 6),
  async (req: Request, res: Response) => {
    console.log("=== POST /api/my-hotels called ===");
    console.log("Request body:", req.body);
    console.log("Files:", (req as any).files);
    console.log("gcashNumber received:", req.body.gcashNumber);
    console.log("downPaymentPercentage received:", req.body.downPaymentPercentage);
    
    try {
      const imageFiles = (req as any).files as any[];
      console.log("Image files count:", imageFiles?.length);
      
      const newHotel: any = req.body;
      console.log("newHotel before parse:", newHotel);

      // Ensure type is always an array
      if (typeof newHotel.type === "string") {
        newHotel.type = [newHotel.type];
      }

      // Parse JSON string fields that might come from frontend
      const jsonFields = ['adultEntranceFee', 'childEntranceFee', 'rooms', 'cottages', 'amenities', 'packages'];
      for (const field of jsonFields) {
        if (newHotel[field] && typeof newHotel[field] === 'string') {
          try {
            newHotel[field] = JSON.parse(newHotel[field]);
          } catch (parseError) {
            console.log(`Failed to parse ${field} as JSON, keeping as is:`, newHotel[field]);
          }
        }
      }

      // Fix empty string values in parsed arrays (required fields)
      if (Array.isArray(newHotel.cottages)) {
        newHotel.cottages = newHotel.cottages.map((c: any) => ({
          ...c,
          type: c.type || 'Standard',
        }));
      }
      if (Array.isArray(newHotel.rooms)) {
        newHotel.rooms = newHotel.rooms.map((r: any) => ({
          ...r,
          type: r.type || 'Standard',
        }));
      }

      // Clear problematic array fields that might be serialized as strings
      // These will be properly parsed below (or use already parsed JSON)
      if (!newHotel.rooms || !Array.isArray(newHotel.rooms)) delete newHotel.rooms;
      if (!newHotel.cottages || !Array.isArray(newHotel.cottages)) delete newHotel.cottages;
      if (!newHotel.amenities || !Array.isArray(newHotel.amenities)) delete newHotel.amenities;
      if (!newHotel.packages || !Array.isArray(newHotel.packages)) delete newHotel.packages;

      // Handle nested objects from FormData
      newHotel.contact = {
        phone: req.body["contact.phone"] || "",
        email: req.body["contact.email"] || "",
        website: req.body["contact.website"] || "",
        facebook: req.body["contact.facebook"] || "",
        instagram: req.body["contact.instagram"] || "",
        tiktok: req.body["contact.tiktok"] || "",
      };

      newHotel.policies = {
        checkInTime: req.body["policies.checkInTime"] || "",
        checkOutTime: req.body["policies.checkOutTime"] || "",
        dayCheckInTime: req.body["policies.dayCheckInTime"] || "",
        dayCheckOutTime: req.body["policies.dayCheckOutTime"] || "",
        nightCheckInTime: req.body["policies.nightCheckInTime"] || "",
        nightCheckOutTime: req.body["policies.nightCheckOutTime"] || "",
        resortPolicies: [],
      };

      // Parse resort policies from FormData
      const resortPolicies: Array<{
        id: string;
        title: string;
        description: string;
        isConfirmed?: boolean;
      }> = [];
      let policyIndex = 0;
      
      // Try multiple key formats
      while (req.body[`policies.resortPolicies[${policyIndex}][id]`] || 
             req.body[`policies.resortPolicies.${policyIndex}.id`] ||
             req.body[`resortPolicies[${policyIndex}][id]`]) {
        
        const policyId = req.body[`policies.resortPolicies[${policyIndex}][id]`] || 
                        req.body[`policies.resortPolicies.${policyIndex}.id`] ||
                        req.body[`resortPolicies[${policyIndex}][id]`];
        
        if (!policyId) break;
        
        resortPolicies.push({
          id: policyId,
          title: req.body[`policies.resortPolicies[${policyIndex}][title]`] || 
                 req.body[`policies.resortPolicies.${policyIndex}.title`] ||
                 req.body[`resortPolicies[${policyIndex}][title]`] || "",
          description: req.body[`policies.resortPolicies[${policyIndex}][description]`] || 
                      req.body[`policies.resortPolicies.${policyIndex}.description`] ||
                      req.body[`resortPolicies[${policyIndex}][description]`] || "",
          isConfirmed: req.body[`policies.resortPolicies[${policyIndex}][isConfirmed]`] === "true" || 
                       req.body[`policies.resortPolicies[${policyIndex}][isConfirmed]`] === true ||
                       req.body[`policies.resortPolicies.${policyIndex}.isConfirmed`] === "true" ||
                       req.body[`policies.resortPolicies.${policyIndex}.isConfirmed`] === true,
        });
        policyIndex++;
      }
      
      // Try JSON parsing as fallback
      if (resortPolicies.length === 0) {
        const policiesJson = req.body["policies.resortPolicies"];
        if (policiesJson) {
          try {
            const parsed = JSON.parse(policiesJson);
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log("Found resortPolicies as JSON string in POST:", parsed);
              newHotel.policies.resortPolicies = parsed;
            }
          } catch (e) {
            console.log("Failed to parse policies.resortPolicies JSON in POST:", e);
          }
        }
      } else if (resortPolicies.length > 0) {
        newHotel.policies.resortPolicies = resortPolicies;
      }

      // Parse amenities from FormData
      const amenities: Array<{
        id: string;
        name: string;
        price: number;
        description?: string;
      }> = [];
      let amenityIndex = 0;
      while (req.body[`amenities[${amenityIndex}][id]`]) {
        amenities.push({
          id: req.body[`amenities[${amenityIndex}][id]`],
          name: req.body[`amenities[${amenityIndex}][name]`],
          price: parseFloat(req.body[`amenities[${amenityIndex}][price]`]) || 0,
          description: req.body[`amenities[${amenityIndex}][description]`] || "",
        });
        amenityIndex++;
      }
      if (amenities.length > 0) {
        newHotel.amenities = amenities;
      }

      // Handle discounts from FormData
      newHotel.discounts = {
        seniorCitizenEnabled: req.body["discounts.seniorCitizenEnabled"] === "true" || req.body["discounts.seniorCitizenEnabled"] === true,
        seniorCitizenPercentage: parseFloat(req.body["discounts.seniorCitizenPercentage"]) || 20,
        pwdEnabled: req.body["discounts.pwdEnabled"] === "true" || req.body["discounts.pwdEnabled"] === true,
        pwdPercentage: parseFloat(req.body["discounts.pwdPercentage"]) || 20,
        customDiscounts: []
      };

      // Parse custom discounts from FormData
      const customDiscounts: Array<{
        id: string;
        name: string;
        percentage: number;
        promoCode: string;
        isEnabled: boolean;
        maxUses?: number;
        validUntil?: string;
      }> = [];
      let discountIndex = 0;
      while (req.body[`discounts.customDiscounts[${discountIndex}][id]`]) {
        const maxUsesVal = req.body[`discounts.customDiscounts[${discountIndex}][maxUses]`];
        const validUntilVal = req.body[`discounts.customDiscounts[${discountIndex}][validUntil]`];
        customDiscounts.push({
          id: req.body[`discounts.customDiscounts[${discountIndex}][id]`],
          name: req.body[`discounts.customDiscounts[${discountIndex}][name]`],
          percentage: parseFloat(req.body[`discounts.customDiscounts[${discountIndex}][percentage]`]) || 0,
          promoCode: req.body[`discounts.customDiscounts[${discountIndex}][promoCode]`],
          isEnabled: req.body[`discounts.customDiscounts[${discountIndex}][isEnabled]`] === "true" || req.body[`discounts.customDiscounts[${discountIndex}][isEnabled]`] === true,
          maxUses: maxUsesVal ? parseInt(maxUsesVal) : undefined,
          validUntil: validUntilVal || undefined,
        });
        discountIndex++;
      }
      if (customDiscounts.length > 0) {
        newHotel.discounts!.customDiscounts = customDiscounts;
      }

      // Parse packages from FormData
      const packages: Array<{
        id: string;
        name: string;
        description: string;
        price: number;
        includedCottages: string[];
        includedRooms: string[];
        includedAmenities: string[];
      }> = [];
      let createPackageIndex = 0;
      while (req.body[`packages[${createPackageIndex}][id]`]) {
        const includedCottages: string[] = [];
        const includedRooms: string[] = [];
        const includedAmenities: string[] = [];
        
        // Parse included cottages
        let packageCottageIndex = 0;
        while (req.body[`packages[${createPackageIndex}][includedCottages][${packageCottageIndex}]`]) {
          includedCottages.push(req.body[`packages[${createPackageIndex}][includedCottages][${packageCottageIndex}]`]);
          packageCottageIndex++;
        }
        
        // Parse included rooms
        let packageRoomIndex = 0;
        while (req.body[`packages[${createPackageIndex}][includedRooms][${packageRoomIndex}]`]) {
          includedRooms.push(req.body[`packages[${createPackageIndex}][includedRooms][${packageRoomIndex}]`]);
          packageRoomIndex++;
        }
        
        // Parse included amenities
        let amenityIndex = 0;
        while (req.body[`packages[${createPackageIndex}][includedAmenities][${amenityIndex}]`]) {
          includedAmenities.push(req.body[`packages[${createPackageIndex}][includedAmenities][${amenityIndex}]`]);
          amenityIndex++;
        }
        
        packages.push({
          id: req.body[`packages[${createPackageIndex}][id]`],
          name: req.body[`packages[${createPackageIndex}][name]`],
          description: req.body[`packages[${createPackageIndex}][description]`],
          price: parseFloat(req.body[`packages[${createPackageIndex}][price]`]) || 0,
          includedCottages,
          includedRooms,
          includedAmenities,
        });
        createPackageIndex++;
      }
      if (packages.length > 0) {
        newHotel.packages = packages;
      }

      // Clear any existing rooms/cottages data to ensure FormData parsing takes priority
      delete newHotel.rooms;
      delete newHotel.cottages;

      // Parse rooms from FormData
      const rooms: Array<{
        id: string;
        name: string;
        type: string;
        pricePerNight: number;
        minOccupancy: number;
        maxOccupancy: number;
        description?: string;
        amenities?: string[];
      }> = [];
      let createRoomIndex = 0;
      while (req.body[`rooms[${createRoomIndex}][id]`]) {
        const roomAmenities: string[] = [];
        let roomAmenityIndex = 0;
        while (req.body[`rooms[${createRoomIndex}][amenities][${roomAmenityIndex}]`]) {
          roomAmenities.push(req.body[`rooms[${createRoomIndex}][amenities][${roomAmenityIndex}]`]);
          roomAmenityIndex++;
        }
        
        rooms.push({
          id: req.body[`rooms[${createRoomIndex}][id]`],
          name: req.body[`rooms[${createRoomIndex}][name]`],
          type: req.body[`rooms[${createRoomIndex}][type]`],
          pricePerNight: parseFloat(req.body[`rooms[${createRoomIndex}][pricePerNight]`]) || 0,
          minOccupancy: parseInt(req.body[`rooms[${createRoomIndex}][minOccupancy]`]) || 1,
          maxOccupancy: parseInt(req.body[`rooms[${createRoomIndex}][maxOccupancy]`]) || 1,
          description: req.body[`rooms[${createRoomIndex}][description]`] || "",
          amenities: roomAmenities,
        });
        createRoomIndex++;
      }
      if (rooms.length > 0) {
        newHotel.rooms = rooms;
      }

      // Parse cottages from FormData
      const cottages: Array<{
        id: string;
        name: string;
        type: string;
        pricePerNight: number;
        dayRate: number;
        nightRate: number;
        hasDayRate: boolean;
        hasNightRate: boolean;
        minOccupancy: number;
        maxOccupancy: number;
        description?: string;
        amenities?: string[];
      }> = [];
      let createCottageIndex = 0;
      while (req.body[`cottages[${createCottageIndex}][id]`]) {
        const cottageAmenities: string[] = [];
        let cottageAmenityIndex = 0;
        while (req.body[`cottages[${createCottageIndex}][amenities][${cottageAmenityIndex}]`]) {
          cottageAmenities.push(req.body[`cottages[${createCottageIndex}][amenities][${cottageAmenityIndex}]`]);
          cottageAmenityIndex++;
        }
        
        cottages.push({
          id: req.body[`cottages[${createCottageIndex}][id]`],
          name: req.body[`cottages[${createCottageIndex}][name]`],
          type: req.body[`cottages[${createCottageIndex}][type]`],
          pricePerNight: parseFloat(req.body[`cottages[${createCottageIndex}][pricePerNight]`]) || 0,
          dayRate: parseFloat(req.body[`cottages[${createCottageIndex}][dayRate]`]) || 0,
          nightRate: parseFloat(req.body[`cottages[${createCottageIndex}][nightRate]`]) || 0,
          hasDayRate: req.body[`cottages[${createCottageIndex}][hasDayRate]`] === "true" || req.body[`cottages[${createCottageIndex}][hasDayRate]`] === true,
          hasNightRate: req.body[`cottages[${createCottageIndex}][hasNightRate]`] === "true" || req.body[`cottages[${createCottageIndex}][hasNightRate]`] === true,
          minOccupancy: parseInt(req.body[`cottages[${createCottageIndex}][minOccupancy]`]) || 1,
          maxOccupancy: parseInt(req.body[`cottages[${createCottageIndex}][maxOccupancy]`]) || 1,
          description: req.body[`cottages[${createCottageIndex}][description]`] || "",
          amenities: cottageAmenities,
        });
        createCottageIndex++;
      }
      if (cottages.length > 0) {
        newHotel.cottages = cottages;
      }

      // Handle image uploads only if files are provided
      let imageUrls: string[] = [];
      if (imageFiles && imageFiles.length > 0) {
        try {
          imageUrls = await imageService.saveImages(imageFiles);
        } catch (uploadError) {
          console.error("Image upload failed:", uploadError);
          // Continue without images if upload fails
          imageUrls = [];
        }
      }

      newHotel.imageUrls = imageUrls;
      newHotel.lastUpdated = new Date();
      newHotel.userId = req.userId;
      
      // Set the new pricing fields
      newHotel.dayRate = Number(req.body.dayRate) || 0;
      newHotel.nightRate = Number(req.body.nightRate) || 0;
      newHotel.hasDayRate = req.body.hasDayRate === "true" || req.body.hasDayRate === true;
      newHotel.hasNightRate = req.body.hasNightRate === "true" || req.body.hasNightRate === true;

      // Parse entrance fees - use already parsed JSON or fallback to FormData
      if (!newHotel.adultEntranceFee || typeof newHotel.adultEntranceFee !== 'object') {
        newHotel.adultEntranceFee = {
          dayRate: Number(req.body["adultEntranceFee.dayRate"]) || 0,
          nightRate: Number(req.body["adultEntranceFee.nightRate"]) || 0,
          pricingModel: req.body["adultEntranceFee.pricingModel"] || "per_head",
          groupQuantity: Number(req.body["adultEntranceFee.groupQuantity"]) || 1,
        };
      }

      // Parse child entrance fees - use already parsed JSON or fallback to FormData
      if (!newHotel.childEntranceFee || !Array.isArray(newHotel.childEntranceFee)) {
        const childEntranceFees: Array<{
          id: string;
          minAge: number;
          maxAge: number;
          dayRate: number;
          nightRate: number;
          pricingModel: "per_head" | "per_group";
          groupQuantity?: number;
          isConfirmed?: boolean;
        }> = [];
        let childFeeIndex = 0;
        while (req.body[`childEntranceFee[${childFeeIndex}][id]`]) {
          childEntranceFees.push({
            id: req.body[`childEntranceFee[${childFeeIndex}][id]`],
            minAge: Number(req.body[`childEntranceFee[${childFeeIndex}][minAge]`]) || 0,
            maxAge: Number(req.body[`childEntranceFee[${childFeeIndex}][maxAge]`]) || 0,
            dayRate: Number(req.body[`childEntranceFee[${childFeeIndex}][dayRate]`]) || 0,
            nightRate: Number(req.body[`childEntranceFee[${childFeeIndex}][nightRate]`]) || 0,
            pricingModel: req.body[`childEntranceFee[${childFeeIndex}][pricingModel]`] || "per_head",
            groupQuantity: req.body[`childEntranceFee[${childFeeIndex}][groupQuantity]`] ? Number(req.body[`childEntranceFee[${childFeeIndex}][groupQuantity]`]) : undefined,
            isConfirmed: req.body[`childEntranceFee[${childFeeIndex}][isConfirmed]`] === "true" || req.body[`childEntranceFee[${childFeeIndex}][isConfirmed]`] === true,
          });
          childFeeIndex++;
        }
        if (childEntranceFees.length > 0) {
          newHotel.childEntranceFee = childEntranceFees;
        }
      }

      // Set approval status - resorts need admin approval
      newHotel.isApproved = false;

      // Handle payment fields
      newHotel.gcashNumber = req.body.gcashNumber || "";
      newHotel.downPaymentPercentage = Number(req.body.downPaymentPercentage) || 50;
      
      console.log("gcashNumber set to:", newHotel.gcashNumber);
      console.log("downPaymentPercentage set to:", newHotel.downPaymentPercentage);

      // Debug entrance fee data before saving (POST route)
      console.log("=== ENTRANCE FEE CREATE DEBUG ===");
      console.log("Rooms entrance fee data:");
      newHotel.rooms?.forEach((room: any, index: number) => {
        console.log(`Room ${index} (${room.name}): includedEntranceFee =`, {
          enabled: room.includedEntranceFee?.enabled,
          adultCount: room.includedEntranceFee?.adultCount,
          childCount: room.includedEntranceFee?.childCount
        });
      });
      console.log("Cottages entrance fee data:");
      newHotel.cottages?.forEach((cottage: any, index: number) => {
        console.log(`Cottage ${index} (${cottage.name}): includedEntranceFee =`, {
          enabled: cottage.includedEntranceFee?.enabled,
          adultCount: cottage.includedEntranceFee?.adultCount,
          childCount: cottage.includedEntranceFee?.childCount
        });
      });
      console.log("=== END ENTRANCE FEE CREATE DEBUG ===");

      // -------------------------------------------------------------
      // SUPABASE INSERTION BLOCK
      // -------------------------------------------------------------
      const resortId = crypto.randomUUID();
      
      const hotelData = {
        id: resortId,
        user_id: req.userId,
        name: newHotel.name,
        city: newHotel.city,
        country: newHotel.country,
        description: newHotel.description,
        types: newHotel.type,
        facilities: newHotel.facilities,
        day_rate: newHotel.dayRate,
        night_rate: newHotel.nightRate,
        has_day_rate: newHotel.hasDayRate,
        has_night_rate: newHotel.hasNightRate,
        star_rating: newHotel.starRating,
        image_urls: newHotel.imageUrls,
        location: newHotel.location || {},
        contact: newHotel.contact || {},
        policies: newHotel.policies || {},
        discounts: newHotel.discounts || {},
        child_entrance_fee: newHotel.childEntranceFee || [],
        adult_entrance_fee: newHotel.adultEntranceFee || {},
        down_payment_percentage: newHotel.downPaymentPercentage,
        gcash_number: newHotel.gcashNumber,
        is_approved: false,
        status: 'pending'
      };

      console.log("📡 Inserting hotel into Supabase public.hotels...");
      const { error: hotelInsertError } = await supabaseAdmin
        .from('hotels')
        .insert(hotelData);
        
      if (hotelInsertError) {
        console.error("❌ Supabase hotel insert error:", hotelInsertError);
        throw new Error(`Failed to insert hotel: ${hotelInsertError.message}`);
      }

      // Insert related rooms
      if (newHotel.rooms && newHotel.rooms.length > 0) {
        const roomsToInsert = newHotel.rooms.map((room: any) => ({
          hotel_id: resortId,
          name: room.name,
          type: room.type,
          price_per_night: room.pricePerNight,
          min_occupancy: room.minOccupancy,
          max_occupancy: room.maxOccupancy,
          description: room.description || "",
          amenities: room.amenities || [],
          image_url: room.imageUrl || "",
          included_entrance_fee: room.includedEntranceFee || { enabled: false, adultCount: 0, childCount: 0 }
        }));
        await supabaseAdmin.from('rooms').insert(roomsToInsert);
      }

      // Insert related cottages
      if (newHotel.cottages && newHotel.cottages.length > 0) {
        const cottagesToInsert = newHotel.cottages.map((cottage: any) => ({
          hotel_id: resortId,
          name: cottage.name,
          type: cottage.type,
          price_per_night: cottage.pricePerNight || 0,
          day_rate: cottage.dayRate || 0,
          night_rate: cottage.nightRate || 0,
          has_day_rate: cottage.hasDayRate || false,
          has_night_rate: cottage.hasNightRate || false,
          min_occupancy: cottage.minOccupancy,
          max_occupancy: cottage.maxOccupancy,
          description: cottage.description || "",
          amenities: cottage.amenities || [],
          image_url: cottage.imageUrl || "",
          included_entrance_fee: cottage.includedEntranceFee || { enabled: false, adultCount: 0, childCount: 0 }
        }));
        await supabaseAdmin.from('cottages').insert(cottagesToInsert);
      }

      // Insert amenities
      if (newHotel.amenities && newHotel.amenities.length > 0) {
        const amenitiesToInsert = newHotel.amenities.map((amenity: any) => ({
          hotel_id: resortId,
          name: amenity.name,
          price: amenity.price || 0,
          description: amenity.description || "",
          image_url: amenity.imageUrl || ""
        }));
        await supabaseAdmin.from('amenities').insert(amenitiesToInsert);
      }
      
      // Insert packages
      if (newHotel.packages && newHotel.packages.length > 0) {
         const packagesToInsert = newHotel.packages.map((pkg: any) => ({
           hotel_id: resortId,
           name: pkg.name,
           description: pkg.description || "",
           price: pkg.price || 0,
           image_url: pkg.imageUrl || "",
           included_cottages: pkg.includedCottages || [],
           included_rooms: pkg.includedRooms || [],
           included_amenities: pkg.includedAmenities || [],
           included_child_entrance_fee: pkg.includedChildEntranceFee || false
         }));
         await supabaseAdmin.from('packages').insert(packagesToInsert);
      }

      // Return the new hotel formatted properly for the frontend
      const returnedHotel = {
        ...newHotel,
        _id: resortId,
        id: resortId,
        userId: req.userId,
        isApproved: false,
        status: 'pending',
        lastUpdated: new Date()
      };

      console.log("✅ Successfully saved hotel to Supabase:", resortId);

      res.status(201).json({
        ...returnedHotel,
        message: "Resort submitted for approval. It will be visible to users once approved by an administrator."
      });
    } catch (error: any) {
      console.error("Error creating hotel:", error);
      
      // Handle validation errors
      if (error.errors && Array.isArray(error.errors)) {
        const validationErrors = error.errors.map((err: any) => ({
          field: err.path,
          message: err.msg,
        }));
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationErrors 
        });
      }
      
      // Handle other errors
      res.status(500).json({ 
        message: "Something went wrong",
        error: error.message || "Unknown error"
      });
    }
  }
);

router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    console.log("📡 Fetching my hotels from Supabase...");
    const { data: hotels, error } = await supabaseAdmin
      .from("hotels")
      .select("*")
      .eq("user_id", req.userId);

    if (error) {
      console.error("❌ Failed to fetch hotels from Supabase:", error);
      return res.status(500).json({ message: "Error fetching hotels" });
    }

    // Map fields so the frontend gets what it expects (_id, etc.)
    const formattedHotels = (hotels || []).map((h: any) => ({
      ...h,
      _id: h.id,
      userId: h.user_id,
      type: h.types
    }));

    res.json(formattedHotels);
  } catch (error) {
    console.error("❌ Error fetching hotels:", error);
    res.status(500).json({ message: "Error fetching hotels" });
  }
});

router.get("/:id", verifyToken, async (req: Request, res: Response) => {
  const id = req.params.id.toString();
  try {
    console.log(`📡 Fetching hotel ${id} from Supabase...`);
    const { data: hotel, error } = await supabaseAdmin
      .from("hotels")
      .select("*")
      .eq("id", id)
      .eq("user_id", req.userId)
      .maybeSingle();

    if (error) {
      console.error("❌ Failed to fetch hotel from Supabase:", error);
      return res.status(500).json({ message: "Error fetching hotel" });
    }

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    // Fetch related rooms, cottages, amenities, and packages for this hotel
    const { data: rooms } = await supabaseAdmin.from("rooms").select("*").eq("hotel_id", id);
    const { data: cottages } = await supabaseAdmin.from("cottages").select("*").eq("hotel_id", id);
    const { data: amenities } = await supabaseAdmin.from("amenities").select("*").eq("hotel_id", id);
    const { data: packages } = await supabaseAdmin.from("packages").select("*").eq("hotel_id", id);

    const formattedHotel = {
      ...hotel,
      _id: hotel.id,
      userId: hotel.user_id,
      type: hotel.types,
      rooms: (rooms || []).map((r: any) => ({
        ...r,
        pricePerNight: r.price_per_night,
        minOccupancy: r.min_occupancy,
        maxOccupancy: r.max_occupancy,
        imageUrl: r.image_url,
        includedEntranceFee: r.included_entrance_fee
      })),
      cottages: (cottages || []).map((c: any) => ({
        ...c,
        pricePerNight: c.price_per_night,
        minOccupancy: c.min_occupancy,
        maxOccupancy: c.max_occupancy,
        imageUrl: c.image_url,
        includedEntranceFee: c.included_entrance_fee
      })),
      amenities: (amenities || []).map((a: any) => ({
        ...a,
        imageUrl: a.image_url
      })),
      packages: (packages || []).map((p: any) => ({
        ...p,
        imageUrl: p.image_url,
        includedCottages: p.included_cottages,
        includedRooms: p.included_rooms,
        includedAmenities: p.included_amenities,
        includedChildEntranceFee: p.included_child_entrance_fee
      }))
    };

    res.json(formattedHotel);
  } catch (error) {
    console.error("❌ Error fetching hotel detail:", error);
    res.status(500).json({ message: "Error fetching hotel details" });
  }
});

// New JSON-based update endpoint for better data handling
router.put(
  "/:hotelId/json",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      console.log("=== PUT /api/my-hotels/:hotelId/json called ===");
      console.log("Request body:", req.body);
      console.log("Hotel ID:", req.params.hotelId);
      console.log("User ID:", req.userId);
      
      // Debug cottages specifically
      if (req.body.cottages) {
        console.log("Cottages being saved:", req.body.cottages);
        req.body.cottages.forEach((cottage: any, index: number) => {
          console.log(`Cottage ${index} being saved:`, {
            id: cottage.id,
            name: cottage.name,
            hasDayRate: cottage.hasDayRate,
            hasNightRate: cottage.hasNightRate,
            dayRate: cottage.dayRate,
            nightRate: cottage.nightRate
          });
        });
      }

      // First, find the existing hotel
      const existingHotel = await Hotel.findOne({
        _id: req.params.hotelId,
        userId: req.userId,
      });

      if (!existingHotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      // Prepare update data with all fields including rooms, cottages, and packages
      const updateData: any = {
        ...req.body,
        lastUpdated: new Date(),
      };

      // Remove fields that don't exist in HotelType
      delete updateData.adultCount;
      delete updateData.childCount;

      // Ensure imageUrls is always present and valid
      if (!updateData.imageUrls || !Array.isArray(updateData.imageUrls) || updateData.imageUrls.length === 0) {
        // Keep existing image URLs if none provided
        updateData.imageUrls = existingHotel.imageUrls || [];
      }

      // Explicitly handle array fields to ensure they remain as arrays
      // These fields are sent as proper object arrays from frontend and should not be stringified
      const arrayFields = ['rooms', 'cottages', 'packages', 'amenities', 'childEntranceFee'];
      console.log("Processing arrayFields:", arrayFields);
      for (const field of arrayFields) {
        if (updateData[field]) {
          // If it's a string, try to parse it as JSON
          if (typeof updateData[field] === 'string') {
            try {
              updateData[field] = JSON.parse(updateData[field]);
              console.log(`Parsed ${field} from string to array:`, updateData[field]);
            } catch (parseError) {
              console.log(`Failed to parse ${field} as JSON, keeping as is:`, updateData[field]);
            }
          }
          
          // Now ensure all nested objects have proper types
          if (Array.isArray(updateData[field])) {
            updateData[field] = updateData[field].map((item: any) => {
              const processedItem: any = { ...item };
              
              // For rooms: convert pricePerNight, minOccupancy, maxOccupancy to numbers
              if (field === 'rooms') {
                if (processedItem.pricePerNight !== undefined) {
                  processedItem.pricePerNight = Number(processedItem.pricePerNight) || 0;
                }
                if (processedItem.minOccupancy !== undefined) {
                  processedItem.minOccupancy = Number(processedItem.minOccupancy) || 1;
                }
                if (processedItem.maxOccupancy !== undefined) {
                  processedItem.maxOccupancy = Number(processedItem.maxOccupancy) || 1;
                }
              }
              
              // For cottages: convert pricePerNight, dayRate, nightRate, minOccupancy, maxOccupancy to numbers
              if (field === 'cottages') {
                if (processedItem.pricePerNight !== undefined) {
                  processedItem.pricePerNight = Number(processedItem.pricePerNight) || 0;
                }
                if (processedItem.dayRate !== undefined) {
                  processedItem.dayRate = Number(processedItem.dayRate) || 0;
                }
                if (processedItem.nightRate !== undefined) {
                  processedItem.nightRate = Number(processedItem.nightRate) || 0;
                }
                if (processedItem.minOccupancy !== undefined) {
                  processedItem.minOccupancy = Number(processedItem.minOccupancy) || 1;
                }
                if (processedItem.maxOccupancy !== undefined) {
                  processedItem.maxOccupancy = Number(processedItem.maxOccupancy) || 1;
                }
                if (processedItem.hasDayRate !== undefined) {
                  processedItem.hasDayRate = processedItem.hasDayRate === true || processedItem.hasDayRate === 'true';
                }
                if (processedItem.hasNightRate !== undefined) {
                  processedItem.hasNightRate = processedItem.hasNightRate === true || processedItem.hasNightRate === 'true';
                }
              }
              
              // For packages: convert price to number and handle boolean fields
              if (field === 'packages') {
                if (processedItem.price !== undefined) {
                  processedItem.price = Number(processedItem.price) || 0;
                }
                if (processedItem.includedAdultEntranceFee !== undefined) {
                  processedItem.includedAdultEntranceFee = processedItem.includedAdultEntranceFee === true || processedItem.includedAdultEntranceFee === 'true';
                }
                if (processedItem.includedChildEntranceFee !== undefined) {
                  processedItem.includedChildEntranceFee = processedItem.includedChildEntranceFee === true || processedItem.includedChildEntranceFee === 'true';
                }
              }
              
              // For amenities: convert price to number
              if (field === 'amenities') {
                if (processedItem.price !== undefined) {
                  processedItem.price = Number(processedItem.price) || 0;
                }
              }
              
              // For childEntranceFee: convert numbers and handle boolean fields
              if (field === 'childEntranceFee') {
                if (processedItem.minAge !== undefined) {
                  processedItem.minAge = Number(processedItem.minAge) || 0;
                }
                if (processedItem.maxAge !== undefined) {
                  processedItem.maxAge = Number(processedItem.maxAge) || 0;
                }
                if (processedItem.dayRate !== undefined) {
                  processedItem.dayRate = Number(processedItem.dayRate) || 0;
                }
                if (processedItem.nightRate !== undefined) {
                  processedItem.nightRate = Number(processedItem.nightRate) || 0;
                }
                if (processedItem.groupQuantity !== undefined) {
                  processedItem.groupQuantity = Number(processedItem.groupQuantity) || 1;
                }
                if (processedItem.isConfirmed !== undefined) {
                  processedItem.isConfirmed = processedItem.isConfirmed === true || processedItem.isConfirmed === 'true';
                }
              }
              
              return processedItem;
            });
          }
        }
      }

      // Handle policies specially - it might come as a stringified JSON object
      if (updateData.policies) {
        console.log("Processing policies field:", typeof updateData.policies);
        if (typeof updateData.policies === 'string') {
          try {
            updateData.policies = JSON.parse(updateData.policies);
            console.log("Parsed policies from string:", updateData.policies);
          } catch (e) {
            console.log("Failed to parse policies:", e);
            updateData.policies = {};
          }
        }
        
        // Now process resortPolicies if it exists
        if (updateData.policies && updateData.policies.resortPolicies) {
          if (typeof updateData.policies.resortPolicies === 'string') {
            try {
              updateData.policies.resortPolicies = JSON.parse(updateData.policies.resortPolicies);
              console.log("Parsed resortPolicies from string:", updateData.policies.resortPolicies);
            } catch (e) {
              console.log("Failed to parse resortPolicies:", e);
              updateData.policies.resortPolicies = [];
            }
          }
          if (!Array.isArray(updateData.policies.resortPolicies)) {
            updateData.policies.resortPolicies = [];
          }
          console.log("Final resortPolicies:", updateData.policies.resortPolicies);
        }
      }

      // Parse stringified JSON fields that might come from frontend
      const stringifiedFields = ['facilities', 'type', 'imageUrls', 'childEntranceFee'];
      for (const field of stringifiedFields) {
        if (updateData[field] && typeof updateData[field] === 'string') {
          try {
            updateData[field] = JSON.parse(updateData[field]);
          } catch (parseError) {
            console.log(`Failed to parse ${field} as JSON, keeping as is:`, updateData[field]);
          }
        }
      }

      // Log policies after processing
      console.log("=== POLICIES AFTER ARRAY PROCESSING ===");
      console.log("updateData.policies:", updateData.policies);
      console.log("updateData.policies.resortPolicies:", updateData.policies?.resortPolicies);

      // Convert string numbers to actual numbers
      if (updateData.dayRate !== undefined) updateData.dayRate = Number(updateData.dayRate);
      if (updateData.nightRate !== undefined) updateData.nightRate = Number(updateData.nightRate);
      if (updateData.starRating !== undefined) updateData.starRating = Number(updateData.starRating);

      // Convert boolean strings to actual booleans
      if (updateData.hasDayRate !== undefined) updateData.hasDayRate = updateData.hasDayRate === "true" || updateData.hasDayRate === true;
      if (updateData.hasNightRate !== undefined) updateData.hasNightRate = updateData.hasNightRate === "true" || updateData.hasNightRate === true;

      // Validate required fields
      const requiredFields = ['name', 'city', 'country', 'description', 'type', 'starRating', 'facilities'];
      for (const field of requiredFields) {
        if (!updateData[field]) {
          return res.status(400).json({ message: `${field} is required` });
        }
      }

      // Ensure type is always an array
      if (typeof updateData.type === "string") {
        updateData.type = [updateData.type];
      }

      console.log("Final update data:", updateData);

      // Use findById + save instead of findByIdAndUpdate to properly handle embedded arrays
      const hotel = await Hotel.findById(req.params.hotelId);
      
      if (!hotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      // Deep clone and sanitize the update data to ensure nested arrays are proper objects
      const sanitizedData = JSON.parse(JSON.stringify(updateData));

      console.log("=== FINAL UPDATE DATA DEBUG ===");
      console.log("sanitizedData.policies:", JSON.stringify(sanitizedData.policies, null, 2));
      console.log("sanitizedData.policies.resortPolicies:", sanitizedData.policies?.resortPolicies);

      // Update the hotel using set to properly handle nested arrays
      hotel.set({
        ...sanitizedData,
        // Ensure these are actual arrays of objects - explicitly re-assign
        rooms: Array.isArray(sanitizedData.rooms) ? [...sanitizedData.rooms] : [],
        cottages: Array.isArray(sanitizedData.cottages) ? [...sanitizedData.cottages] : [],
        amenities: Array.isArray(sanitizedData.amenities) ? [...sanitizedData.amenities] : [],
        packages: Array.isArray(sanitizedData.packages) ? [...sanitizedData.packages] : [],
        // Also explicitly handle policies to ensure resortPolicies are saved
        policies: {
          ...sanitizedData.policies,
          resortPolicies: Array.isArray(sanitizedData.policies?.resortPolicies) 
            ? [...sanitizedData.policies.resortPolicies] 
            : []
        },
        // Explicitly include gcashNumber and downPaymentPercentage
        gcashNumber: sanitizedData.gcashNumber,
        downPaymentPercentage: sanitizedData.downPaymentPercentage
      });

      // Debug entrance fee data before saving
      console.log("=== ENTRANCE FEE SAVE DEBUG ===");
      console.log("Rooms entrance fee data:");
      sanitizedData.rooms?.forEach((room: any, index: number) => {
        console.log(`Room ${index} (${room.name}): includedEntranceFee =`, {
          enabled: room.includedEntranceFee?.enabled,
          adultCount: room.includedEntranceFee?.adultCount,
          childCount: room.includedEntranceFee?.childCount
        });
      });
      console.log("Cottages entrance fee data:");
      sanitizedData.cottages?.forEach((cottage: any, index: number) => {
        console.log(`Cottage ${index} (${cottage.name}): includedEntranceFee =`, {
          enabled: cottage.includedEntranceFee?.enabled,
          adultCount: cottage.includedEntranceFee?.adultCount,
          childCount: cottage.includedEntranceFee?.childCount
        });
      });
      console.log("=== END ENTRANCE FEE SAVE DEBUG ===");

      const updatedHotel = await hotel.save();

      console.log("=== HOTEL SAVE DEBUG ===");
      console.log("Saved policies.resortPolicies:", updatedHotel.policies?.resortPolicies);
      console.log("Hotel updated successfully with rooms:", updatedHotel.rooms?.length || 0);
      console.log("Hotel updated successfully with cottages:", updatedHotel.cottages?.length || 0);
      console.log("Hotel updated successfully with packages:", updatedHotel.packages?.length || 0);
      console.log("Saved gcashNumber:", updatedHotel.gcashNumber);
      console.log("Saved downPaymentPercentage:", updatedHotel.downPaymentPercentage);

      res.status(200).json(updatedHotel);
    } catch (error: any) {
      console.error("Error updating hotel:", error);
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map((err: any) => ({
          field: err.path,
          message: err.message,
        }));
        return res.status(400).json({ 
          message: "Validation failed", 
          errors: validationErrors 
        });
      }
      
      res.status(500).json({ message: "Something went wrong", error: error.message });
    }
  }
);

// Fixed TypeScript types for rooms and cottages parsing
router.put(
  "/:hotelId",
  verifyToken,
  upload.fields([
    { name: "imageFiles", maxCount: 10 },
    { name: "roomFiles", maxCount: 20 },
    { name: "cottageFiles", maxCount: 20 },
    { name: "packageFiles", maxCount: 20 },
  ]),
  async (req: Request, res: Response) => {
    try {
      console.log("=== PUT /api/my-hotels/:hotelId called ===");
      console.log("Request body keys:", Object.keys(req.body));
      console.log("Request body sample:", req.body);
      console.log("=== BACKEND UPDATE DEBUG ===");
      console.log("Request body:", req.body);
      console.log("Hotel ID:", req.params.hotelId);
      console.log("User ID:", req.userId);
      const uploadedFiles = (req as any).files;
      console.log("Uploaded files:", uploadedFiles);
      console.log("Image files:", uploadedFiles?.imageFiles);
      console.log("Room files:", uploadedFiles?.roomFiles);
      console.log("Cottage files:", uploadedFiles?.cottageFiles);
      console.log("Package files:", uploadedFiles?.packageFiles);
      console.log("gcashNumber received in FormData PUT:", req.body.gcashNumber);
      console.log("downPaymentPercentage received in FormData PUT:", req.body.downPaymentPercentage);
      
      // Debug rooms data
      console.log("=== ROOMS DEBUG ===");
      let debugRoomIndex = 0;
      while (req.body[`rooms[${debugRoomIndex}][id]`]) {
        console.log(`Room ${debugRoomIndex}:`, {
          id: req.body[`rooms[${debugRoomIndex}][id]`],
          name: req.body[`rooms[${debugRoomIndex}][name]`],
          pricePerNight: req.body[`rooms[${debugRoomIndex}][pricePerNight]`]
        });
        debugRoomIndex++;
      }
      console.log(`Total rooms found: ${debugRoomIndex}`);
      
      // Debug cottages data
      console.log("=== COTTAGES DEBUG ===");
      let debugCottageIndex = 0;
      while (req.body[`cottages[${debugCottageIndex}][id]`]) {
        console.log(`Cottage ${debugCottageIndex}:`, {
          id: req.body[`cottages[${debugCottageIndex}][id]`],
          name: req.body[`cottages[${debugCottageIndex}][name]`],
          dayRate: req.body[`cottages[${debugCottageIndex}][dayRate]`],
          nightRate: req.body[`cottages[${debugCottageIndex}][nightRate]`]
        });
        debugCottageIndex++;
      }
      console.log(`Total cottages found: ${debugCottageIndex}`);
      
      // Debug packages data
      console.log("=== PACKAGES DEBUG ===");
      let debugPackageIndex = 0;
      while (req.body[`packages[${debugPackageIndex}][id]`]) {
        console.log(`Package ${debugPackageIndex}:`, {
          id: req.body[`packages[${debugPackageIndex}][id]`],
          name: req.body[`packages[${debugPackageIndex}][name]`],
          price: req.body[`packages[${debugPackageIndex}][price]`],
          imageUrl: req.body[`packages[${debugPackageIndex}][imageUrl]`]
        });
        debugPackageIndex++;
      }
      console.log(`Total packages found: ${debugPackageIndex}`);

      // First, find the existing hotel
      const existingHotel = await Hotel.findOne({
        _id: req.params.hotelId,
        userId: req.userId,
      });

      if (!existingHotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      // Prepare update data
      const updateData: any = {
        name: req.body.name,
        city: req.body.city,
        country: req.body.country,
        description: req.body.description,
        type: Array.isArray(req.body.type) ? req.body.type : [req.body.type],
        dayRate: Number(req.body.dayRate) || 0,
        nightRate: Number(req.body.nightRate) || 0,
        hasDayRate: req.body.hasDayRate === "true" || req.body.hasDayRate === true,
        hasNightRate: req.body.hasNightRate === "true" || req.body.hasNightRate === true,
        starRating: Number(req.body.starRating),
        facilities: Array.isArray(req.body.facilities)
          ? req.body.facilities
          : [req.body.facilities],
        lastUpdated: new Date(),
      };

      // Handle contact information
      updateData.contact = {
        phone: req.body["contact.phone"] || "",
        email: req.body["contact.email"] || "",
        website: req.body["contact.website"] || "",
        facebook: req.body["contact.facebook"] || "",
        instagram: req.body["contact.instagram"] || "",
        tiktok: req.body["contact.tiktok"] || "",
      };

      // Handle policies - log what we receive
      console.log("=== POLICIES PARSING START ===");
      console.log("req.body policies.checkInTime:", req.body["policies.checkInTime"]);
      console.log("req.body policies.dayCheckInTime:", req.body["policies.dayCheckInTime"]);
      console.log("req.body policies.resortPolicies (raw):", req.body["policies.resortPolicies"]);
      
      updateData.policies = {
        checkInTime: req.body["policies.checkInTime"] || "",
        checkOutTime: req.body["policies.checkOutTime"] || "",
        dayCheckInTime: req.body["policies.dayCheckInTime"] || "",
        dayCheckOutTime: req.body["policies.dayCheckOutTime"] || "",
        nightCheckInTime: req.body["policies.nightCheckInTime"] || "",
        nightCheckOutTime: req.body["policies.nightCheckOutTime"] || "",
        resortPolicies: [],
      };

      // Parse resort policies from FormData
      const resortPolicies: Array<{
        id: string;
        title: string;
        description: string;
        isConfirmed?: boolean;
      }> = [];
      let policyIndex = 0;
      
      console.log("=== RESORT POLICIES DEBUG ===");
      console.log("All req.body keys containing 'policies':", Object.keys(req.body).filter(k => k.includes('policies')));
      console.log("Checking for resort policies in FormData...");
      
      // First, let's try to find any keys that might contain resort policy data
      const allKeys = Object.keys(req.body);
      const policyKeys = allKeys.filter(k => k.includes('resortPolicies'));
      console.log("Keys containing 'resortPolicies':", policyKeys);
      
      // Also try to find keys that start with just '[' - for array format
      const arrayFormatKeys = allKeys.filter(k => k.startsWith('[') || k.match(/^\d+\./));
      console.log("Keys in array format:", arrayFormatKeys);
      
      // Try multiple key formats that might be used
      while (req.body[`policies.resortPolicies[${policyIndex}][id]`] || 
             req.body[`policies.resortPolicies.${policyIndex}.id`] ||
             req.body[`resortPolicies[${policyIndex}][id]`] ||
             req.body[`resortPolicies.${policyIndex}.id`]) {
        
        const policyId = req.body[`policies.resortPolicies[${policyIndex}][id]`] || 
                        req.body[`policies.resortPolicies.${policyIndex}.id`] ||
                        req.body[`resortPolicies[${policyIndex}][id]`];
        
        if (!policyId) break;
        
        const policy = {
          id: policyId,
          title: req.body[`policies.resortPolicies[${policyIndex}][title]`] || 
                 req.body[`policies.resortPolicies.${policyIndex}.title`] ||
                 req.body[`resortPolicies[${policyIndex}][title]`] || "",
          description: req.body[`policies.resortPolicies[${policyIndex}][description]`] || 
                      req.body[`policies.resortPolicies.${policyIndex}.description`] ||
                      req.body[`resortPolicies[${policyIndex}][description]`] || "",
          isConfirmed: req.body[`policies.resortPolicies[${policyIndex}][isConfirmed]`] === "true" || 
                       req.body[`policies.resortPolicies[${policyIndex}][isConfirmed]`] === true ||
                       req.body[`policies.resortPolicies.${policyIndex}.isConfirmed`] === "true" ||
                       req.body[`policies.resortPolicies.${policyIndex}.isConfirmed`] === true,
        };
        
        console.log(`Found policy ${policyIndex}:`, policy);
        resortPolicies.push(policy);
        policyIndex++;
      }
      
      console.log(`Total resort policies found: ${resortPolicies.length}`);
      
      if (resortPolicies.length > 0) {
        updateData.policies.resortPolicies = resortPolicies;
        console.log("Resort policies added to updateData:", updateData.policies.resortPolicies);
      } else {
        console.log("No resort policies found in FormData - will try JSON parsing");
        
        // Try parsing resortPolicies from a JSON string field as fallback
        const policiesJson = req.body["policies.resortPolicies"];
        console.log("Found policies.resortPolicies in body:", policiesJson);
        if (policiesJson) {
          try {
            const parsed = typeof policiesJson === 'string' ? JSON.parse(policiesJson) : policiesJson;
            if (Array.isArray(parsed) && parsed.length > 0) {
              console.log("Found resortPolicies as JSON string:", parsed);
              updateData.policies.resortPolicies = parsed;
              console.log("Resort policies added to updateData from JSON string:", updateData.policies.resortPolicies);
            } else {
              console.log("Parsed policies is not an array or is empty:", parsed);
            }
          } catch (e) {
            console.log("Failed to parse policies.resortPolicies JSON:", e);
          }
        } else {
          console.log("No policies.resortPolicies field found in req.body");
          // Log all keys to help debug
          console.log("All req.body keys:", Object.keys(req.body));
        }
      }

      // Parse amenities from FormData
      const amenities: Array<{
        id: string;
        name: string;
        price: number;
        description?: string;
      }> = [];
      let amenityIndex = 0;
      while (req.body[`amenities[${amenityIndex}][id]`]) {
        amenities.push({
          id: req.body[`amenities[${amenityIndex}][id]`],
          name: req.body[`amenities[${amenityIndex}][name]`],
          price: parseFloat(req.body[`amenities[${amenityIndex}][price]`]) || 0,
          description: req.body[`amenities[${amenityIndex}][description]`] || "",
        });
        amenityIndex++;
      }
      if (amenities.length > 0) {
        updateData.amenities = amenities;
      }

      // Handle discounts from FormData
      updateData.discounts = {
        seniorCitizenEnabled: req.body["discounts.seniorCitizenEnabled"] === "true" || req.body["discounts.seniorCitizenEnabled"] === true,
        seniorCitizenPercentage: parseFloat(req.body["discounts.seniorCitizenPercentage"]) || 20,
        pwdEnabled: req.body["discounts.pwdEnabled"] === "true" || req.body["discounts.pwdEnabled"] === true,
        pwdPercentage: parseFloat(req.body["discounts.pwdPercentage"]) || 20,
        customDiscounts: []
      };

      // Parse custom discounts from FormData
      const customDiscounts: Array<{
        id: string;
        name: string;
        percentage: number;
        promoCode: string;
        isEnabled: boolean;
        maxUses?: number;
        validUntil?: string;
      }> = [];
      let discountIndex = 0;
      while (req.body[`discounts.customDiscounts[${discountIndex}][id]`]) {
        const maxUsesVal = req.body[`discounts.customDiscounts[${discountIndex}][maxUses]`];
        const validUntilVal = req.body[`discounts.customDiscounts[${discountIndex}][validUntil]`];
        customDiscounts.push({
          id: req.body[`discounts.customDiscounts[${discountIndex}][id]`],
          name: req.body[`discounts.customDiscounts[${discountIndex}][name]`],
          percentage: parseFloat(req.body[`discounts.customDiscounts[${discountIndex}][percentage]`]) || 0,
          promoCode: req.body[`discounts.customDiscounts[${discountIndex}][promoCode]`],
          isEnabled: req.body[`discounts.customDiscounts[${discountIndex}][isEnabled]`] === "true" || req.body[`discounts.customDiscounts[${discountIndex}][isEnabled]`] === true,
          maxUses: maxUsesVal ? parseInt(maxUsesVal) : undefined,
          validUntil: validUntilVal || undefined,
        });
        discountIndex++;
      }
      if (customDiscounts.length > 0) {
        updateData.discounts!.customDiscounts = customDiscounts;
      }

      // Parse packages from FormData
      const packages: Array<{
        id: string;
        name: string;
        description: string;
        price: number;
        includedCottages: string[];
        includedRooms: string[];
        includedAmenities: string[];
        imageUrl: string;
      }> = [];
      let createPackageIndex = 0;
      while (req.body[`packages[${createPackageIndex}][id]`]) {
        const includedCottages: string[] = [];
        const includedRooms: string[] = [];
        const includedAmenities: string[] = [];
        
        // Parse included cottages
        let packageCottageIndex = 0;
        while (req.body[`packages[${createPackageIndex}][includedCottages][${packageCottageIndex}]`]) {
          includedCottages.push(req.body[`packages[${createPackageIndex}][includedCottages][${packageCottageIndex}]`]);
          packageCottageIndex++;
        }
        
        // Parse included rooms
        let packageRoomIndex = 0;
        while (req.body[`packages[${createPackageIndex}][includedRooms][${packageRoomIndex}]`]) {
          includedRooms.push(req.body[`packages[${createPackageIndex}][includedRooms][${packageRoomIndex}]`]);
          packageRoomIndex++;
        }
        
        // Parse included amenities
        let amenityIndex = 0;
        while (req.body[`packages[${createPackageIndex}][includedAmenities][${amenityIndex}]`]) {
          includedAmenities.push(req.body[`packages[${createPackageIndex}][includedAmenities][${amenityIndex}]`]);
          amenityIndex++;
        }
        
        packages.push({
          id: req.body[`packages[${createPackageIndex}][id]`],
          name: req.body[`packages[${createPackageIndex}][name]`],
          description: req.body[`packages[${createPackageIndex}][description]`],
          price: parseFloat(req.body[`packages[${createPackageIndex}][price]`]) || 0,
          includedCottages,
          includedRooms,
          includedAmenities,
          imageUrl: req.body[`packages[${createPackageIndex}][imageUrl]`] || "",
        });
        createPackageIndex++;
      }
      if (packages.length > 0) {
        updateData.packages = packages;
      }

      // Parse rooms from FormData
      const rooms: Array<{
        id: string;
        name: string;
        type: string;
        pricePerNight: number;
        minOccupancy: number;
        maxOccupancy: number;
        description?: string;
        amenities?: string[];
        imageUrl: string;
      }> = [];
      let createRoomIndex = 0;
      while (req.body[`rooms[${createRoomIndex}][id]`]) {
        const roomAmenities: string[] = [];
        let roomAmenityIndex = 0;
        while (req.body[`rooms[${createRoomIndex}][amenities][${roomAmenityIndex}]`]) {
          roomAmenities.push(req.body[`rooms[${createRoomIndex}][amenities][${roomAmenityIndex}]`]);
          roomAmenityIndex++;
        }
        
        rooms.push({
          id: req.body[`rooms[${createRoomIndex}][id]`],
          name: req.body[`rooms[${createRoomIndex}][name]`],
          type: req.body[`rooms[${createRoomIndex}][type]`],
          pricePerNight: parseFloat(req.body[`rooms[${createRoomIndex}][pricePerNight]`]) || 0,
          minOccupancy: parseInt(req.body[`rooms[${createRoomIndex}][minOccupancy]`]) || 1,
          maxOccupancy: parseInt(req.body[`rooms[${createRoomIndex}][maxOccupancy]`]) || 1,
          description: req.body[`rooms[${createRoomIndex}][description]`] || "",
          amenities: roomAmenities,
          imageUrl: req.body[`rooms[${createRoomIndex}][imageUrl]`] || "",
        });
        createRoomIndex++;
      }
      if (rooms.length > 0) {
        updateData.rooms = rooms;
      }

      // Parse cottages from FormData
      const cottages: Array<{
        id: string;
        name: string;
        type: string;
        pricePerNight: number;
        dayRate: number;
        nightRate: number;
        hasDayRate: boolean;
        hasNightRate: boolean;
        minOccupancy: number;
        maxOccupancy: number;
        description?: string;
        amenities?: string[];
        imageUrl: string;
      }> = [];
      let updateCottageIndex = 0;
      while (req.body[`cottages[${updateCottageIndex}][id]`]) {
        const cottageAmenities: string[] = [];
        let cottageAmenityIndex = 0;
        while (req.body[`cottages[${updateCottageIndex}][amenities][${cottageAmenityIndex}]`]) {
          cottageAmenities.push(req.body[`cottages[${updateCottageIndex}][amenities][${cottageAmenityIndex}]`]);
          cottageAmenityIndex++;
        }
        
        cottages.push({
          id: req.body[`cottages[${updateCottageIndex}][id]`],
          name: req.body[`cottages[${updateCottageIndex}][name]`],
          type: req.body[`cottages[${updateCottageIndex}][type]`],
          pricePerNight: parseFloat(req.body[`cottages[${updateCottageIndex}][pricePerNight]`]) || 0,
          dayRate: parseFloat(req.body[`cottages[${updateCottageIndex}][dayRate]`]) || 0,
          nightRate: parseFloat(req.body[`cottages[${updateCottageIndex}][nightRate]`]) || 0,
          hasDayRate: req.body[`cottages[${updateCottageIndex}][hasDayRate]`] === "true" || req.body[`cottages[${updateCottageIndex}][hasDayRate]`] === true,
          hasNightRate: req.body[`cottages[${updateCottageIndex}][hasNightRate]`] === "true" || req.body[`cottages[${updateCottageIndex}][hasNightRate]`] === true,
          minOccupancy: parseInt(req.body[`cottages[${updateCottageIndex}][minOccupancy]`]) || 1,
          maxOccupancy: parseInt(req.body[`cottages[${updateCottageIndex}][maxOccupancy]`]) || 1,
          description: req.body[`cottages[${updateCottageIndex}][description]`] || "",
          amenities: cottageAmenities,
          imageUrl: req.body[`cottages[${updateCottageIndex}][imageUrl]`] || "",
        });
        updateCottageIndex++;
      }
      if (cottages.length > 0) {
        updateData.cottages = cottages;
      }

      // Update the hotel
      // Handle image uploads if any
      const uploadedFilesUpdate = (req as any).files;
      const imageFiles = uploadedFilesUpdate?.imageFiles as any[] || [];
      const roomFiles = uploadedFilesUpdate?.roomFiles as any[] || [];
      const cottageFiles = uploadedFilesUpdate?.cottageFiles as any[] || [];
      const packageFiles = uploadedFilesUpdate?.packageFiles as any[] || [];
      
      let finalImageUrls: string[] = [];
      
      // Handle main hotel image uploads
      if (imageFiles && imageFiles.length > 0) {
        // Upload new images using the new image service
        const newImageUrls = await imageService.saveImages(imageFiles);
        
        // Get existing image URLs from request body
        const existingImageUrls = req.body.imageUrls
          ? Array.isArray(req.body.imageUrls)
            ? req.body.imageUrls
            : [req.body.imageUrls]
          : [];
        
        // Combine existing and new images
        finalImageUrls = [...existingImageUrls, ...newImageUrls];
        
        // Update the hotel with all image URLs
        updateData.imageUrls = finalImageUrls;
      } else if (req.body.imageUrls && (Array.isArray(req.body.imageUrls) ? req.body.imageUrls.length > 0 : req.body.imageUrls)) {
        // No new files, but imageUrls provided in request - update with provided URLs
        finalImageUrls = Array.isArray(req.body.imageUrls)
          ? req.body.imageUrls
          : [req.body.imageUrls];
        
        // Update the hotel with all image URLs
        updateData.imageUrls = finalImageUrls;
      }
      // If no files and no imageUrls provided, don't update imageUrls field (keep existing)
      
      // Handle accommodation image uploads
      console.log("=== ACCOMMODATION IMAGE UPLOAD DEBUG ===");
      console.log("Room files:", roomFiles);
      console.log("Cottage files:", cottageFiles);
      console.log("Package files:", packageFiles);
      
      // Process room image files
      if (roomFiles && roomFiles.length > 0) {
        console.log("Processing room image files...");
        const roomImageUrls = await imageService.saveImages(roomFiles);
        console.log("Room image URLs:", roomImageUrls);
        
        // Update rooms with new image URLs based on their index
        const updatedRooms = rooms.map((room, index) => {
          const roomFileKey = `roomFiles[${index}]`;
          const roomFileIndex = roomFiles.findIndex((file: any) => file.fieldname === roomFileKey);
          if (roomFileIndex !== -1 && roomImageUrls[roomFileIndex]) {
            return { ...room, imageUrl: roomImageUrls[roomFileIndex] };
          }
          // Check if imageUrl is explicitly set to empty string in form data
          const formImageUrl = req.body[`rooms[${index}][imageUrl]`];
          if (formImageUrl === "" || formImageUrl === null) {
            return { ...room, imageUrl: "" };
          }
          return room;
        });
        updateData.rooms = updatedRooms;
      } else {
        // No new room files, but check if imageUrl was cleared in form data
        const updatedRooms = rooms.map((room, index) => {
          const formImageUrl = req.body[`rooms[${index}][imageUrl]`];
          if (formImageUrl === "" || formImageUrl === null) {
            return { ...room, imageUrl: "" };
          }
          return room;
        });
        updateData.rooms = updatedRooms;
      }
      
      // Process cottage image files
      if (cottageFiles && cottageFiles.length > 0) {
        console.log("Processing cottage image files...");
        const cottageImageUrls = await imageService.saveImages(cottageFiles);
        console.log("Cottage image URLs:", cottageImageUrls);
        
        // Update cottages with new image URLs based on their index
        const updatedCottages = cottages.map((cottage, index) => {
          const cottageFileKey = `cottageFiles[${index}]`;
          const cottageFileIndex = cottageFiles.findIndex((file: any) => file.fieldname === cottageFileKey);
          if (cottageFileIndex !== -1 && cottageImageUrls[cottageFileIndex]) {
            return { ...cottage, imageUrl: cottageImageUrls[cottageFileIndex] };
          }
          // Check if imageUrl is explicitly set to empty string in form data
          const formImageUrl = req.body[`cottages[${index}][imageUrl]`];
          if (formImageUrl === "" || formImageUrl === null) {
            return { ...cottage, imageUrl: "" };
          }
          return cottage;
        });
        updateData.cottages = updatedCottages;
      } else {
        // No new cottage files, but check if imageUrl was cleared in form data
        const updatedCottages = cottages.map((cottage, index) => {
          const formImageUrl = req.body[`cottages[${index}][imageUrl]`];
          if (formImageUrl === "" || formImageUrl === null) {
            return { ...cottage, imageUrl: "" };
          }
          return cottage;
        });
        updateData.cottages = updatedCottages;
      }
      
      // Process package image files
      if (packageFiles && packageFiles.length > 0) {
        console.log("Processing package image files...");
        const packageImageUrls = await imageService.saveImages(packageFiles);
        console.log("Package image URLs:", packageImageUrls);
        
        // Update packages with new image URLs based on their index
        const updatedPackages = packages.map((pkg, index) => {
          const packageFileKey = `packageFiles[${index}]`;
          const packageFileIndex = packageFiles.findIndex((file: any) => file.fieldname === packageFileKey);
          if (packageFileIndex !== -1 && packageImageUrls[packageFileIndex]) {
            return { ...pkg, imageUrl: packageImageUrls[packageFileIndex] };
          }
          // Check if imageUrl is explicitly set to empty string in form data
          const formImageUrl = req.body[`packages[${index}][imageUrl]`];
          if (formImageUrl === "" || formImageUrl === null) {
            return { ...pkg, imageUrl: "" };
          }
          return pkg;
        });
        updateData.packages = updatedPackages;
      } else {
        // No new package files, but check if imageUrl was cleared in form data
        const updatedPackages = packages.map((pkg, index) => {
          const formImageUrl = req.body[`packages[${index}][imageUrl]`];
          if (formImageUrl === "" || formImageUrl === null) {
            return { ...pkg, imageUrl: "" };
          }
          return pkg;
        });
        updateData.packages = updatedPackages;
      }
      
      // Debug: Log the full updateData before updating
      console.log("=== FINAL UPDATE DATA ===");
      console.log("updateData.policies:", JSON.stringify(updateData.policies, null, 2));
      
      // Add payment fields to updateData
      updateData.gcashNumber = req.body.gcashNumber || "";
      updateData.downPaymentPercentage = Number(req.body.downPaymentPercentage) || 50;
      
      console.log("gcashNumber in FormData PUT:", updateData.gcashNumber);
      console.log("downPaymentPercentage in FormData PUT:", updateData.downPaymentPercentage);
      
      const updatedHotel = await Hotel.findByIdAndUpdate(
        req.params.hotelId,
        updateData,
        { new: true }
      );

      if (!updatedHotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      res.status(200).json(updatedHotel);
    } catch (error) {
      console.error("Error updating hotel:", error);
      console.error("Request body:", req.body);
      console.error("Hotel ID:", req.params.hotelId);
      console.error("User ID:", req.userId);
      res.status(500).json({
        message: "Something went wrong",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

router.delete(
  "/:hotelId",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const hotelId = req.params.hotelId;

      // First check if the hotel exists and belongs to the user
      const hotel = await Hotel.findOne({
        _id: hotelId,
        userId: req.userId,
      });

      if (!hotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      // Check if there are any active bookings for this hotel
      const activeBookings = await Booking.countDocuments({
        hotelId: hotelId,
        status: { $in: ["pending", "confirmed"] },
      });

      if (activeBookings > 0) {
        return res.status(400).json({ 
          message: "Cannot delete resort with active bookings. Please cancel all bookings first." 
        });
      }

      // Delete the hotel
      await Hotel.findByIdAndDelete(hotelId);

      res.status(200).json({ 
        message: "Resort deleted successfully" 
      });
    } catch (error) {
      console.error("Error deleting hotel:", error);
      res.status(500).json({ 
        message: "Something went wrong",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

export default router;
