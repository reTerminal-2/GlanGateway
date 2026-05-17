import express, { Request, Response } from "express";
import verifyToken from "../middleware/auth";
import { body, param, validationResult } from "express-validator";
import { asyncHandler } from "../middleware/errorHandler";
import { supabaseAdmin } from "../core/supabase";
import { canModifyBooking, checkAndUpdateBookingStatus } from "../services/bookingValidationService";

const router = express.Router();

// Get all bookings (admin only)
router.get("/", verifyToken, asyncHandler(async (req: Request, res: Response) => {
  // Verify admin status
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", req.userId)
    .maybeSingle();

  const isAdmin = user && ["admin", "superAdmin"].includes(user.role);

  if (!isAdmin) {
    return res.status(403).json({ message: "Access denied. Only admins can view all bookings." });
  }

  const { data: bookings, error } = await supabaseAdmin
    .from("bookings")
    .select("*, hotels(name, city, country)")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("❌ Failed to fetch all bookings from Supabase:", error);
    return res.status(500).json({ message: "Error fetching bookings" });
  }

  // Format bookings to match what frontend expects
  const formattedBookings = (bookings || []).map((b: any) => ({
    ...b,
    _id: b.id,
    userId: b.user_id,
    hotelId: b.hotel_id,
    hotelInfo: b.hotels, // POPULATED info
    firstName: b.first_name,
    lastName: b.last_name,
    totalCost: b.total_cost,
    checkIn: b.check_in,
    checkOut: b.check_out,
    paymentStatus: b.payment_status,
    createdAt: b.created_at
  }));

  res.status(200).json(formattedBookings);
}));

// Get bookings by hotel ID (for hotel owners)
router.get(
  "/hotel/:hotelId",
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { hotelId } = req.params;

    // Verify the hotel belongs to the authenticated user
    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select("user_id")
      .eq("id", hotelId)
      .maybeSingle();

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }

    if (hotel.user_id !== req.userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { data: bookings, error } = await supabaseAdmin
      .from("bookings")
      .select("*, users(first_name, last_name, email)")
      .eq("hotel_id", hotelId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("❌ Failed to fetch bookings from Supabase:", error);
      return res.status(500).json({ message: "Error fetching bookings" });
    }

    const formattedBookings = (bookings || []).map((b: any) => ({
      ...b,
      _id: b.id,
      userId: b.user_id,
      hotelId: b.hotel_id,
      user: b.users ? {
        firstName: b.users.first_name,
        lastName: b.users.last_name,
        email: b.users.email
      } : null,
      firstName: b.first_name,
      lastName: b.last_name,
      totalCost: b.total_cost,
      checkIn: b.check_in,
      checkOut: b.check_out,
      paymentStatus: b.payment_status,
      createdAt: b.created_at
    }));

    res.status(200).json(formattedBookings);
  })
);

// Get booking by ID
router.get("/:id", verifyToken, asyncHandler(async (req: Request, res: Response) => {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("*, hotels(name, city, country, image_urls, user_id)")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error || !booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  // Check user ownership, hotel ownership, or admin status
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", req.userId)
    .maybeSingle();

  const isOwner = booking.user_id === req.userId;
  const isHotelOwner = booking.hotels && booking.hotels.user_id === req.userId;
  const isAdmin = user && ["admin", "superAdmin"].includes(user.role);

  if (!isOwner && !isHotelOwner && !isAdmin) {
    return res.status(403).json({ message: "Access denied" });
  }

  // Map to validation schema model
  const validationModel: any = {
    status: booking.status,
    changeWindowDeadline: booking.change_window_deadline ? new Date(booking.change_window_deadline) : undefined,
    canModify: booking.can_modify
  };

  // Check and update booking status based on 8-hour window
  await checkAndUpdateBookingStatus(validationModel);

  const formattedBooking = {
    ...booking,
    _id: booking.id,
    userId: booking.user_id,
    hotelId: booking.hotel_id,
    hotel: booking.hotels ? {
      name: booking.hotels.name,
      city: booking.hotels.city,
      country: booking.hotels.country,
      imageUrls: booking.hotels.image_urls,
      userId: booking.hotels.user_id
    } : null,
    firstName: booking.first_name,
    lastName: booking.last_name,
    adultCount: booking.adult_count,
    childCount: booking.child_count,
    checkIn: booking.check_in,
    checkOut: booking.check_out,
    checkInTime: booking.check_in_time,
    checkOutTime: booking.check_out_time,
    totalCost: booking.total_cost,
    basePrice: booking.base_price,
    roomIds: booking.room_ids,
    cottageIds: booking.cottage_ids,
    selectedRooms: booking.selected_rooms,
    selectedAmenities: booking.selected_amenities,
    paymentMethod: booking.payment_method,
    paymentStatus: booking.payment_status,
    createdAt: booking.created_at,
    changeWindowDeadline: booking.change_window_deadline,
    canModify: booking.can_modify
  };

  res.status(200).json(formattedBooking);
}));

// Update booking status
router.patch(
  "/:id/status",
  verifyToken,
  [
    body("status")
      .isIn(["pending", "confirmed", "cancelled", "completed", "refunded"])
      .withMessage("Invalid status"),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0]?.msg || "Validation error" });
    }

    const { status, cancellationReason } = req.body;

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("*, hotels(user_id)")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error || !booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check user ownership, hotel ownership, or admin status
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    const isOwner = booking.user_id === req.userId;
    const isHotelOwner = booking.hotels && booking.hotels.user_id === req.userId;
    const isAdmin = user && ["admin", "superAdmin"].includes(user.role);

    if (!isOwner && !isHotelOwner && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updateData: any = { status };
    if (status === "cancelled" && cancellationReason) {
      updateData.cancellation_reason = cancellationReason;
    }
    if (status === "refunded") {
      updateData.refund_amount = req.body.refundAmount || 0;
    }

    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(updateData)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (updateError || !updatedBooking) {
      console.error("❌ Update status error:", updateError);
      return res.status(500).json({ message: "Unable to update booking" });
    }

    res.status(200).json({
      ...updatedBooking,
      _id: updatedBooking.id
    });
  })
);

// Update payment status
router.patch(
  "/:id/payment",
  verifyToken,
  [
    body("paymentStatus")
      .isIn(["pending", "paid", "failed", "refunded"])
      .withMessage("Invalid payment status"),
  ],
  asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: errors.array()[0]?.msg || "Validation error" });
    }

    const { paymentStatus, paymentMethod } = req.body;

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("*, hotels(user_id)")
      .eq("id", req.params.id)
      .maybeSingle();

    if (error || !booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    // Check user ownership, hotel ownership, or admin status
    const { data: user } = await supabaseAdmin
      .from("users")
      .select("role")
      .eq("id", req.userId)
      .maybeSingle();

    const isOwner = booking.user_id === req.userId;
    const isHotelOwner = booking.hotels && booking.hotels.user_id === req.userId;
    const isAdmin = user && ["admin", "superAdmin"].includes(user.role);

    if (!isOwner && !isHotelOwner && !isAdmin) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updateData: any = { payment_status: paymentStatus };
    if (paymentMethod) {
      updateData.payment_method = paymentMethod;
    }

    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(updateData)
      .eq("id", req.params.id)
      .select()
      .maybeSingle();

    if (updateError || !updatedBooking) {
      console.error("❌ Update payment error:", updateError);
      return res.status(500).json({ message: "Unable to update booking" });
    }

    res.status(200).json({
      ...updatedBooking,
      _id: updatedBooking.id
    });
  })
);

// Delete booking (admin only)
router.delete("/:id", verifyToken, asyncHandler(async (req: Request, res: Response) => {
  const { data: booking, error } = await supabaseAdmin
    .from("bookings")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();

  if (error || !booking) {
    return res.status(404).json({ message: "Booking not found" });
  }

  // Verify admin status
  const { data: user } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", req.userId)
    .maybeSingle();

  const isAdmin = user && ["admin", "superAdmin"].includes(user.role);

  if (!isAdmin) {
    return res.status(403).json({ message: "Access denied. Only admins can delete bookings." });
  }

  // Delete booking
  const { error: deleteError } = await supabaseAdmin
    .from("bookings")
    .delete()
    .eq("id", req.params.id);

  if (deleteError) {
    console.error("❌ Delete error:", deleteError);
    return res.status(500).json({ message: "Unable to delete booking" });
  }

  // Update hotel analytics
  const { data: currentHotel } = await supabaseAdmin
    .from("hotels")
    .select("total_bookings, total_revenue")
    .eq("id", booking.hotel_id)
    .maybeSingle();

  const newHotelBookings = Math.max(0, (currentHotel?.total_bookings || 0) - 1);
  const newHotelRevenue = Math.max(0, Number(currentHotel?.total_revenue || 0) - Number(booking.total_cost || 0));

  await supabaseAdmin
    .from("hotels")
    .update({
      total_bookings: newHotelBookings,
      total_revenue: newHotelRevenue
    })
    .eq("id", booking.hotel_id);

  // Update user analytics
  const { data: currentUser } = await supabaseAdmin
    .from("users")
    .select("total_bookings, total_spent")
    .eq("id", booking.user_id)
    .maybeSingle();

  const newUserBookings = Math.max(0, (currentUser?.total_bookings || 0) - 1);
  const newUserSpent = Math.max(0, Number(currentUser?.total_spent || 0) - Number(booking.total_cost || 0));

  await supabaseAdmin
    .from("users")
    .update({
      total_bookings: newUserBookings,
      total_spent: newUserSpent
    })
    .eq("id", booking.user_id);

  res.status(200).json({ message: "Booking deleted successfully" });
}));

// Verify booking by resort owner
router.patch(
  "/:id/verify-by-owner",
  verifyToken,
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { verified, verificationNote } = req.body;
    
    // Find the booking
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    
    // Get the hotel to check ownership
    const { data: hotel } = await supabaseAdmin
      .from("hotels")
      .select("user_id")
      .eq("id", booking.hotel_id)
      .maybeSingle();

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found" });
    }
    
    // Check if the user is the resort owner
    if (hotel.user_id !== req.userId) {
      return res.status(403).json({ message: "Access denied. Only the resort owner can verify bookings." });
    }
    
    const updateData: any = {
      verified_by_owner: verified,
      owner_verification_note: verificationNote || (verified ? "Verified by resort owner" : "Verification rejected"),
      owner_verified_at: verified ? new Date().toISOString() : null
    };
    
    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(updateData)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (updateError || !updatedBooking) {
      console.error("❌ Verify error:", updateError);
      return res.status(500).json({ message: "Failed to verify booking" });
    }
    
    res.status(200).json({
      message: verified ? "Booking verified successfully" : "Booking verification rejected",
      booking: {
        ...updatedBooking,
        _id: updatedBooking.id
      }
    });
  })
);

export default router;
