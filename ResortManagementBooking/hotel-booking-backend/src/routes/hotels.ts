import express, { Request, Response } from "express";
import crypto from "crypto";
import { param, validationResult } from "express-validator";
import Stripe from "stripe";
import verifyToken from "../middleware/auth";
import { supabaseAdmin } from "../core/supabase";
import { HotelSearchResponse } from "../types";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);
const router = express.Router();

router.get("/search", async (req: Request, res: Response) => {
  try {
    const { destination, stars, maxPrice, sortOption, page } = req.query;

    let queryBuilder = supabaseAdmin.from("hotels").select("*", { count: "exact" });

    // Show all resorts that are not explicitly rejected
    queryBuilder = queryBuilder.neq("status", "declined");

    // Destination filter
    if (destination && typeof destination === "string" && destination.trim() !== "") {
      const dest = destination.trim();
      queryBuilder = queryBuilder.or(`name.ilike.%${dest}%,city.ilike.%${dest}%,country.ilike.%${dest}%`);
    }

    // Stars filter
    if (stars) {
      const starRatings = Array.isArray(stars)
        ? stars.map((s: any) => parseInt(s))
        : [parseInt(stars as string)];
      queryBuilder = queryBuilder.in("star_rating", starRatings);
    }

    // maxPrice filter
    if (maxPrice) {
      const maxPriceVal = parseFloat(maxPrice as string);
      queryBuilder = queryBuilder.or(`day_rate.lte.${maxPriceVal},night_rate.lte.${maxPriceVal}`);
    }

    // Apply sorting
    if (sortOption === "starRating") {
      queryBuilder = queryBuilder.order("star_rating", { ascending: false });
    } else if (sortOption === "pricePerNightAsc") {
      queryBuilder = queryBuilder.order("night_rate", { ascending: true });
    } else if (sortOption === "pricePerNightDesc") {
      queryBuilder = queryBuilder.order("night_rate", { ascending: false });
    } else {
      queryBuilder = queryBuilder.order("last_updated", { ascending: false });
    }

    // Pagination
    const pageSize = 5;
    const pageNumber = parseInt(page ? page.toString() : "1");
    const from = (pageNumber - 1) * pageSize;
    const to = from + pageSize - 1;

    queryBuilder = queryBuilder.range(from, to);

    const { data: hotels, count: total, error } = await queryBuilder;

    if (error) {
      console.error("❌ Search error:", error);
      return res.status(500).json({ message: "Something went wrong" });
    }

    // Reconstruct nested tables (rooms, cottages) for each hotel
    const hotelsWithSubItems = await Promise.all(
      (hotels || []).map(async (hotel: any) => {
        const { data: rooms } = await supabaseAdmin.from("rooms").select("*").eq("hotel_id", hotel.id);
        const { data: cottages } = await supabaseAdmin.from("cottages").select("*").eq("hotel_id", hotel.id);
        
        return {
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
          }))
        };
      })
    );

    const totalCount = total || 0;

    const response: HotelSearchResponse = {
      data: hotelsWithSubItems,
      pagination: {
        total: totalCount,
        page: pageNumber,
        pages: Math.ceil(totalCount / pageSize),
      },
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Search catch error:", error);
    res.status(500).json({ message: "Something went wrong" });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    console.log("📡 Public fetching hotels from Supabase...");
    const { data: hotels, error } = await supabaseAdmin
      .from("hotels")
      .select("*")
      .neq("status", "declined")
      .order("last_updated", { ascending: false });

    if (error) {
      console.error("❌ Fetch error:", error);
      return res.status(500).json({ message: "Error fetching hotels" });
    }

    const formattedHotels = await Promise.all(
      (hotels || []).map(async (h: any) => {
        const { data: rooms } = await supabaseAdmin.from("rooms").select("*").eq("hotel_id", h.id);
        const { data: cottages } = await supabaseAdmin.from("cottages").select("*").eq("hotel_id", h.id);
        return {
          ...h,
          _id: h.id,
          userId: h.user_id,
          type: h.types,
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
          }))
        };
      })
    );

    res.json(formattedHotels);
  } catch (error) {
    console.error("error", error);
    res.status(500).json({ message: "Error fetching hotels" });
  }
});

router.get(
  "/:id",
  [param("id").notEmpty().withMessage("Hotel ID is required")],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const id = req.params.id.toString();

    try {
      console.log(`📡 Public fetching hotel details for ID: ${id}`);
      const { data: hotel, error } = await supabaseAdmin
        .from("hotels")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) {
        console.error("❌ Detail error:", error);
        return res.status(500).json({ message: "Error fetching hotel" });
      }

      if (!hotel) {
        return res.status(404).json({ message: "Hotel not found" });
      }

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
      console.error(error);
      res.status(500).json({ message: "Error fetching hotel" });
    }
  }
);

router.post(
  "/:hotelId/bookings/payment-intent",
  verifyToken,
  async (req: Request, res: Response) => {
    const { numberOfNights } = req.body;
    const hotelId = req.params.hotelId;

    const { data: hotel, error } = await supabaseAdmin
      .from("hotels")
      .select("*")
      .eq("id", hotelId)
      .maybeSingle();

    if (error || !hotel) {
      return res.status(400).json({ message: "Hotel not found" });
    }

    const nightRate = Number(hotel.night_rate) || 0;
    const totalCost = numberOfNights > 0 ? nightRate * numberOfNights : nightRate;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCost * 100,
      currency: "php",
      metadata: {
        hotelId,
        userId: req.userId,
      },
    });

    if (!paymentIntent.client_secret) {
      return res.status(500).json({ message: "Error creating payment intent" });
    }

    const response = {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret.toString(),
      totalCost,
    };

    res.send(response);
  }
);

router.post(
  "/:hotelId/bookings",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const paymentIntentId = req.body.paymentIntentId;

      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId as string
      );

      if (!paymentIntent) {
        return res.status(400).json({ message: "payment intent not found" });
      }

      if (
        paymentIntent.metadata.hotelId !== req.params.hotelId ||
        paymentIntent.metadata.userId !== req.userId
      ) {
        return res.status(400).json({ message: "payment intent mismatch" });
      }

      if (paymentIntent.status !== "succeeded") {
        return res.status(400).json({
          message: `payment intent not succeeded. Status: ${paymentIntent.status}`,
        });
      }

      const bookingId = crypto.randomUUID();
      const checkInDate = new Date(req.body.checkIn).toISOString();
      const checkOutDate = new Date(req.body.checkOut).toISOString();

      const newBooking = {
        id: bookingId,
        user_id: req.userId,
        hotel_id: req.params.hotelId,
        first_name: req.body.firstName,
        last_name: req.body.lastName,
        email: req.body.email,
        phone: req.body.phone || "",
        adult_count: Number(req.body.adultCount) || 1,
        child_count: Number(req.body.childCount) || 0,
        check_in: checkInDate,
        check_out: checkOutDate,
        check_in_time: req.body.checkInTime || "12:00",
        check_out_time: req.body.checkOutTime || "11:00",
        total_cost: Number(req.body.totalCost),
        base_price: Number(req.body.basePrice) || Number(req.body.totalCost),
        room_ids: req.body.roomIds || [],
        cottage_ids: req.body.cottageIds || [],
        selected_rooms: req.body.selectedRooms || [],
        selected_amenities: req.body.selectedAmenities || [],
        status: "confirmed",
        payment_status: "paid",
        payment_method: "card",
        is_pwd_booking: req.body.isPwdBooking || false,
        is_senior_citizen_booking: req.body.isSeniorCitizenBooking || false,
        discount_applied: req.body.discountApplied || { type: null, percentage: 0, amount: 0 }
      };

      console.log("📡 Creating booking in Supabase public.bookings...");
      const { error: bookingInsertError } = await supabaseAdmin
        .from("bookings")
        .insert(newBooking);

      if (bookingInsertError) {
        console.error("❌ Supabase booking insert error:", bookingInsertError);
        return res.status(500).json({ message: "Failed to create booking" });
      }

      // Update hotel analytics
      const { data: currentHotel } = await supabaseAdmin
        .from("hotels")
        .select("total_bookings, total_revenue")
        .eq("id", req.params.hotelId)
        .maybeSingle();

      const newHotelBookings = (currentHotel?.total_bookings || 0) + 1;
      const newHotelRevenue = Number(currentHotel?.total_revenue || 0) + Number(req.body.totalCost);

      await supabaseAdmin
        .from("hotels")
        .update({
          total_bookings: newHotelBookings,
          total_revenue: newHotelRevenue
        })
        .eq("id", req.params.hotelId);

      // Update user analytics
      const { data: currentUser } = await supabaseAdmin
        .from("users")
        .select("total_bookings, total_spent")
        .eq("id", req.userId)
        .maybeSingle();

      const newUserBookings = (currentUser?.total_bookings || 0) + 1;
      const newUserSpent = Number(currentUser?.total_spent || 0) + Number(req.body.totalCost);

      await supabaseAdmin
        .from("users")
        .update({
          total_bookings: newUserBookings,
          total_spent: newUserSpent
        })
        .eq("id", req.userId);

      console.log("✅ Booking created successfully:", bookingId);
      res.status(200).json({ 
        message: "Booking created successfully",
        bookingId: bookingId,
        booking: {
          ...newBooking,
          _id: bookingId
        }
      });
    } catch (error: any) {
      console.error("Booking creation error:", error);
      res.status(500).json({ 
        message: "Failed to create booking. Please try again.",
        error: error.message
      });
    }
  }
);

export default router;
