import express, { Request, Response } from "express";
import multer from "multer";
import imageService from "../services/imageService";
import verifyToken from "../middleware/auth";
import { body } from "express-validator";
import { HotelType } from "../types";
import crypto from "crypto";
import path from "path";
import { supabaseAdmin } from "../core/supabase";
import { formatHotelDbToApi } from "../utils/format";

const router = express.Router();

// Enforce strictly memoryStorage for cloud serverless environments
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
    const formattedHotels = await Promise.all(
      (hotels || []).map(async (h: any) => {
        const { data: rooms } = await supabaseAdmin.from("rooms").select("*").eq("hotel_id", h.id);
        const { data: cottages } = await supabaseAdmin.from("cottages").select("*").eq("hotel_id", h.id);
        return formatHotelDbToApi(h, rooms || [], cottages || []);
      })
    );

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

    const formattedHotel = formatHotelDbToApi(
      hotel,
      rooms || [],
      cottages || [],
      amenities || [],
      packages || []
    );

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

      // Verify the hotel exists and belongs to this user
      const { data: existingHotel, error: findError } = await supabaseAdmin
        .from("hotels")
        .select("*")
        .eq("id", req.params.hotelId)
        .eq("user_id", req.userId)
        .maybeSingle();

      if (findError || !existingHotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      const updateData: any = { ...req.body };

      // Remove fields that shouldn't be directly updated
      delete updateData.adultCount;
      delete updateData.childCount;
      delete updateData._id;
      delete updateData.id;
      delete updateData.userId;
      delete updateData.user_id;

      // Parse JSON strings if needed
      const arrayFields = ['rooms', 'cottages', 'packages', 'amenities', 'childEntranceFee'];
      for (const field of arrayFields) {
        if (updateData[field] && typeof updateData[field] === 'string') {
          try { updateData[field] = JSON.parse(updateData[field]); } catch { /* keep as-is */ }
        }
      }

      // Parse stringified JSON fields
      const stringifiedFields = ['facilities', 'type', 'imageUrls', 'policies'];
      for (const field of stringifiedFields) {
        if (updateData[field] && typeof updateData[field] === 'string') {
          try { updateData[field] = JSON.parse(updateData[field]); } catch { /* keep as-is */ }
        }
      }

      // Handle policies.resortPolicies
      if (updateData.policies && typeof updateData.policies.resortPolicies === 'string') {
        try { updateData.policies.resortPolicies = JSON.parse(updateData.policies.resortPolicies); } catch { updateData.policies.resortPolicies = []; }
      }

      // Convert numbers
      if (updateData.dayRate !== undefined) updateData.dayRate = Number(updateData.dayRate);
      if (updateData.nightRate !== undefined) updateData.nightRate = Number(updateData.nightRate);
      if (updateData.starRating !== undefined) updateData.starRating = Number(updateData.starRating);
      if (updateData.hasDayRate !== undefined) updateData.hasDayRate = updateData.hasDayRate === "true" || updateData.hasDayRate === true;
      if (updateData.hasNightRate !== undefined) updateData.hasNightRate = updateData.hasNightRate === "true" || updateData.hasNightRate === true;

      // Ensure type is always an array
      if (typeof updateData.type === "string") {
        updateData.type = [updateData.type];
      }

      // Process rooms, cottages etc. for proper number types
      if (Array.isArray(updateData.rooms)) {
        updateData.rooms = updateData.rooms.map((r: any) => ({
          ...r,
          pricePerNight: Number(r.pricePerNight) || 0,
          minOccupancy: Number(r.minOccupancy) || 1,
          maxOccupancy: Number(r.maxOccupancy) || 1,
        }));
      }
      if (Array.isArray(updateData.cottages)) {
        updateData.cottages = updateData.cottages.map((c: any) => ({
          ...c,
          pricePerNight: Number(c.pricePerNight) || 0,
          dayRate: Number(c.dayRate) || 0,
          nightRate: Number(c.nightRate) || 0,
          hasDayRate: c.hasDayRate === true || c.hasDayRate === 'true',
          hasNightRate: c.hasNightRate === true || c.hasNightRate === 'true',
          minOccupancy: Number(c.minOccupancy) || 1,
          maxOccupancy: Number(c.maxOccupancy) || 1,
        }));
      }
      if (Array.isArray(updateData.amenities)) {
        updateData.amenities = updateData.amenities.map((a: any) => ({
          ...a,
          price: Number(a.price) || 0,
        }));
      }
      if (Array.isArray(updateData.packages)) {
        updateData.packages = updateData.packages.map((p: any) => ({
          ...p,
          price: Number(p.price) || 0,
        }));
      }

      // ── Build the Supabase update payload ──
      const hotelUpdate: Record<string, any> = {
        name: updateData.name,
        city: updateData.city,
        country: updateData.country,
        description: updateData.description,
        types: updateData.type || existingHotel.types,
        facilities: updateData.facilities || existingHotel.facilities,
        day_rate: updateData.dayRate ?? existingHotel.day_rate,
        night_rate: updateData.nightRate ?? existingHotel.night_rate,
        has_day_rate: updateData.hasDayRate ?? existingHotel.has_day_rate,
        has_night_rate: updateData.hasNightRate ?? existingHotel.has_night_rate,
        star_rating: updateData.starRating ?? existingHotel.star_rating,
        image_urls: updateData.imageUrls || existingHotel.image_urls,
        contact: updateData.contact || existingHotel.contact,
        policies: updateData.policies || existingHotel.policies,
        discounts: updateData.discounts || existingHotel.discounts,
        child_entrance_fee: updateData.childEntranceFee || existingHotel.child_entrance_fee,
        adult_entrance_fee: updateData.adultEntranceFee || existingHotel.adult_entrance_fee,
        gcash_number: updateData.gcashNumber ?? existingHotel.gcash_number,
        down_payment_percentage: Number(updateData.downPaymentPercentage) || existingHotel.down_payment_percentage || 50,
        updated_at: new Date().toISOString(),
      };

      // Update the hotel record
      const { error: hotelUpdateError } = await supabaseAdmin
        .from("hotels")
        .update(hotelUpdate)
        .eq("id", req.params.hotelId);

      if (hotelUpdateError) {
        console.error("❌ Hotel update error:", hotelUpdateError);
        return res.status(500).json({ message: "Failed to update hotel", error: hotelUpdateError.message });
      }

      // ── Upsert rooms ──
      if (Array.isArray(updateData.rooms)) {
        // Delete existing rooms and re-insert
        await supabaseAdmin.from("rooms").delete().eq("hotel_id", req.params.hotelId);
        if (updateData.rooms.length > 0) {
          const roomsToInsert = updateData.rooms.map((room: any) => ({
            hotel_id: req.params.hotelId,
            name: room.name,
            type: room.type || 'Standard',
            price_per_night: room.pricePerNight,
            min_occupancy: room.minOccupancy,
            max_occupancy: room.maxOccupancy,
            description: room.description || "",
            amenities: room.amenities || [],
            image_url: room.imageUrl || "",
            included_entrance_fee: room.includedEntranceFee || { enabled: false, adultCount: 0, childCount: 0 }
          }));
          await supabaseAdmin.from("rooms").insert(roomsToInsert);
        }
      }

      // ── Upsert cottages ──
      if (Array.isArray(updateData.cottages)) {
        await supabaseAdmin.from("cottages").delete().eq("hotel_id", req.params.hotelId);
        if (updateData.cottages.length > 0) {
          const cottagesToInsert = updateData.cottages.map((c: any) => ({
            hotel_id: req.params.hotelId,
            name: c.name,
            type: c.type || 'Standard',
            price_per_night: c.pricePerNight || 0,
            day_rate: c.dayRate || 0,
            night_rate: c.nightRate || 0,
            has_day_rate: c.hasDayRate || false,
            has_night_rate: c.hasNightRate || false,
            min_occupancy: c.minOccupancy,
            max_occupancy: c.maxOccupancy,
            description: c.description || "",
            amenities: c.amenities || [],
            image_url: c.imageUrl || "",
            included_entrance_fee: c.includedEntranceFee || { enabled: false, adultCount: 0, childCount: 0 }
          }));
          await supabaseAdmin.from("cottages").insert(cottagesToInsert);
        }
      }

      // ── Upsert amenities ──
      if (Array.isArray(updateData.amenities)) {
        await supabaseAdmin.from("amenities").delete().eq("hotel_id", req.params.hotelId);
        if (updateData.amenities.length > 0) {
          const amenitiesToInsert = updateData.amenities.map((a: any) => ({
            hotel_id: req.params.hotelId,
            name: a.name,
            price: a.price || 0,
            description: a.description || "",
            image_url: a.imageUrl || ""
          }));
          await supabaseAdmin.from("amenities").insert(amenitiesToInsert);
        }
      }

      // ── Upsert packages ──
      if (Array.isArray(updateData.packages)) {
        await supabaseAdmin.from("packages").delete().eq("hotel_id", req.params.hotelId);
        if (updateData.packages.length > 0) {
          const packagesToInsert = updateData.packages.map((p: any) => ({
            hotel_id: req.params.hotelId,
            name: p.name,
            description: p.description || "",
            price: p.price || 0,
            image_url: p.imageUrl || "",
            included_cottages: p.includedCottages || [],
            included_rooms: p.includedRooms || [],
            included_amenities: p.includedAmenities || [],
            included_child_entrance_fee: p.includedChildEntranceFee || false
          }));
          await supabaseAdmin.from("packages").insert(packagesToInsert);
        }
      }

      // Return updated hotel with related entities
      const { data: finalHotel } = await supabaseAdmin.from("hotels").select("*").eq("id", req.params.hotelId).maybeSingle();
      const { data: rooms } = await supabaseAdmin.from("rooms").select("*").eq("hotel_id", req.params.hotelId);
      const { data: cottages } = await supabaseAdmin.from("cottages").select("*").eq("hotel_id", req.params.hotelId);
      const { data: amenities } = await supabaseAdmin.from("amenities").select("*").eq("hotel_id", req.params.hotelId);
      const { data: packages } = await supabaseAdmin.from("packages").select("*").eq("hotel_id", req.params.hotelId);

      const formattedResponse = {
        ...finalHotel,
        _id: finalHotel?.id,
        userId: finalHotel?.user_id,
        type: finalHotel?.types,
        rooms: (rooms || []).map((r: any) => ({ ...r, pricePerNight: r.price_per_night, minOccupancy: r.min_occupancy, maxOccupancy: r.max_occupancy, imageUrl: r.image_url, includedEntranceFee: r.included_entrance_fee })),
        cottages: (cottages || []).map((c: any) => ({ ...c, pricePerNight: c.price_per_night, minOccupancy: c.min_occupancy, maxOccupancy: c.max_occupancy, imageUrl: c.image_url, includedEntranceFee: c.included_entrance_fee })),
        amenities: (amenities || []).map((a: any) => ({ ...a, imageUrl: a.image_url })),
        packages: (packages || []).map((p: any) => ({ ...p, imageUrl: p.image_url, includedCottages: p.included_cottages, includedRooms: p.included_rooms, includedAmenities: p.included_amenities, includedChildEntranceFee: p.included_child_entrance_fee })),
      };

      console.log("✅ Hotel updated successfully via JSON route");
      res.status(200).json(formattedResponse);
    } catch (error: any) {
      console.error("Error updating hotel:", error);
      res.status(500).json({ message: "Something went wrong", error: error.message });
    }
  }
);
      
// Fallback FormData PUT endpoint (used if frontend doesn't use the JSON endpoint)
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
      console.log("=== PUT /api/my-hotels/:hotelId (FormData) called ===");

      // Verify the hotel exists and belongs to this user
      const { data: existingHotel, error: findError } = await supabaseAdmin
        .from("hotels")
        .select("*")
        .eq("id", req.params.hotelId)
        .eq("user_id", req.userId)
        .maybeSingle();

      if (findError || !existingHotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      // Handle file uploads to Supabase Storage if present
      const uploadedFiles = (req as any).files;
      const uploadedImageUrls: string[] = [];
      if (uploadedFiles?.imageFiles) {
        for (const file of uploadedFiles.imageFiles) {
          const fileExt = path.extname(file.originalname);
          const fileName = `${crypto.randomUUID()}${fileExt}`;
          const { error: uploadError } = await supabaseAdmin.storage
            .from('hotel-images')
            .upload(fileName, file.buffer, { contentType: file.mimetype });
            
          if (!uploadError) {
            const { data: publicUrlData } = supabaseAdmin.storage
              .from('hotel-images')
              .getPublicUrl(fileName);
            uploadedImageUrls.push(publicUrlData.publicUrl);
          }
        }
      }

      // Merge existing images with new ones
      let existingImageUrls: string[] = [];
      if (req.body.imageUrls) {
        existingImageUrls = Array.isArray(req.body.imageUrls) 
          ? req.body.imageUrls 
          : [req.body.imageUrls];
      }
      const finalImageUrls = [...existingImageUrls, ...uploadedImageUrls];

      const hotelUpdate: Record<string, any> = {
        name: req.body.name,
        city: req.body.city,
        country: req.body.country,
        description: req.body.description,
        types: Array.isArray(req.body.type) ? req.body.type : [req.body.type],
        facilities: Array.isArray(req.body.facilities) ? req.body.facilities : [req.body.facilities],
        day_rate: Number(req.body.dayRate) || 0,
        night_rate: Number(req.body.nightRate) || 0,
        has_day_rate: req.body.hasDayRate === "true" || req.body.hasDayRate === true,
        has_night_rate: req.body.hasNightRate === "true" || req.body.hasNightRate === true,
        star_rating: Number(req.body.starRating) || 0,
        image_urls: finalImageUrls,
        gcash_number: req.body.gcashNumber || "",
        down_payment_percentage: Number(req.body.downPaymentPercentage) || 50,
        updated_at: new Date().toISOString(),
      };

      // Handle policies if passed as string
      if (req.body.policies) {
        try {
          hotelUpdate.policies = typeof req.body.policies === 'string' 
            ? JSON.parse(req.body.policies) 
            : req.body.policies;
        } catch { }
      }

      const { error: hotelUpdateError } = await supabaseAdmin
        .from("hotels")
        .update(hotelUpdate)
        .eq("id", req.params.hotelId);

      if (hotelUpdateError) {
        return res.status(500).json({ message: "Failed to update hotel" });
      }

      // We skip nested arrays (rooms/cottages/etc) for FormData PUT as the frontend now prefers JSON
      // If needed, the logic from POST / can be duplicated here, but the frontend primarily uses JSON for edits.

      // Return updated hotel
      const { data: updatedHotel } = await supabaseAdmin
        .from("hotels")
        .select("*")
        .eq("id", req.params.hotelId)
        .maybeSingle();

      res.status(200).json({ ...updatedHotel, _id: updatedHotel?.id });
    } catch (error: any) {
      console.error("Error updating hotel:", error);
      res.status(500).json({ message: "Something went wrong", error: error.message });
    }
  }
);

router.delete(
  "/:hotelId",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const hotelId = req.params.hotelId;

      // Check if the hotel exists and belongs to the user
      const { data: hotel, error: findError } = await supabaseAdmin
        .from("hotels")
        .select("id")
        .eq("id", hotelId)
        .eq("user_id", req.userId)
        .maybeSingle();

      if (findError || !hotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

      // Check if there are any active bookings for this hotel
      const { count: activeBookings } = await supabaseAdmin
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("hotel_id", hotelId)
        .in("status", ["pending", "confirmed"]);

      if (activeBookings && activeBookings > 0) {
        return res.status(400).json({ 
          message: "Cannot delete resort with active bookings. Please cancel all bookings first." 
        });
      }

      // Delete the hotel (cascade should handle related entities)
      const { error: deleteError } = await supabaseAdmin
        .from("hotels")
        .delete()
        .eq("id", hotelId);

      if (deleteError) {
        return res.status(500).json({ message: "Failed to delete resort", error: deleteError.message });
      }

      res.status(200).json({ message: "Resort deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting hotel:", error);
      res.status(500).json({ 
        message: "Something went wrong",
        error: error.message,
      });
    }
  }
);

export default router;
