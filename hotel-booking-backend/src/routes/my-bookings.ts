import express, { Request, Response } from "express";
import verifyToken from "../middleware/auth";
import { supabaseAdmin } from "../core/supabase";
import { canModifyBooking } from "../services/bookingValidationService";

const router = express.Router();

// GET /api/my-bookings
router.get("/", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    console.log(`📡 Fetching bookings for user ${userId} from Supabase...`);
    const { data: bookings, error: bookingsError } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    
    if (bookingsError) {
      console.error("❌ Failed to fetch bookings from Supabase:", bookingsError);
      return res.status(500).json({ message: "Unable to fetch bookings" });
    }
    
    if (!bookings || bookings.length === 0) {
      return res.status(200).json([]);
    }
    
    // Group bookings by hotelId
    const hotelBookingsMap = new Map();
    
    for (const booking of bookings) {
      const hotelId = booking.hotel_id;
      if (!hotelId) continue;
      
      if (!hotelBookingsMap.has(hotelId)) {
        // Fetch hotel info
        const { data: hotel } = await supabaseAdmin
          .from("hotels")
          .select("*")
          .eq("id", hotelId)
          .maybeSingle();
          
        if (hotel) {
          hotelBookingsMap.set(hotelId, {
            ...hotel,
            _id: hotel.id,
            userId: hotel.user_id,
            type: hotel.types,
            bookings: []
          });
        }
      }
      
      const hotelData = hotelBookingsMap.get(hotelId);
      if (hotelData) {
        // Map fields to what the frontend expects
        hotelData.bookings.push({
          ...booking,
          _id: booking.id,
          userId: booking.user_id,
          hotelId: booking.hotel_id,
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
        });
      }
    }
    
    const results = Array.from(hotelBookingsMap.values());
    res.status(200).send(results);
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({ message: "Unable to fetch bookings" });
  }
});

// DELETE /api/my-bookings/:bookingId
router.delete("/:bookingId", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { bookingId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Find the booking
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    
    if (error || !booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    
    // Check if the booking belongs to the user
    if (booking.user_id !== userId) {
      return res.status(403).json({ message: "You can only delete your own bookings" });
    }
    
    // Check if the booking is confirmed by resort owner or cancelled
    if (booking.status !== "confirmed" && booking.status !== "cancelled") {
      return res.status(400).json({ 
        message: "You can only delete bookings that have been confirmed by the resort owner or have been cancelled" 
      });
    }
    
    // Delete the booking
    const { error: deleteError } = await supabaseAdmin
      .from("bookings")
      .delete()
      .eq("id", bookingId);
      
    if (deleteError) {
      console.error("❌ Failed to delete booking:", deleteError);
      return res.status(500).json({ message: "Unable to delete booking" });
    }
    
    res.status(200).json({ message: "Booking deleted successfully" });
  } catch (error) {
    console.error("Error deleting booking:", error);
    res.status(500).json({ message: "Unable to delete booking" });
  }
});

// PUT /api/my-bookings/:bookingId
router.put("/:bookingId", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { bookingId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Find the booking
    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    
    if (error || !booking) {
      return res.status(404).json({ message: "Booking not found" });
    }
    
    // Check if the booking belongs to the user
    if (booking.user_id !== userId) {
      return res.status(403).json({ message: "You can only update your own bookings" });
    }
    
    // Map to validation schema model
    const validationModel: any = {
      status: booking.status,
      changeWindowDeadline: booking.change_window_deadline ? new Date(booking.change_window_deadline) : undefined,
      canModify: booking.can_modify
    };
    
    // Use centralized 8-hour window check
    const modificationCheck = canModifyBooking(validationModel);
    if (!modificationCheck.canModify) {
      return res.status(400).json({ 
        message: modificationCheck.reason,
        changeWindowDeadline: modificationCheck.changeWindowDeadline,
        currentTime: modificationCheck.currentTime
      });
    }
    
    // MASS ASSIGNMENT PROTECTION: Whitelist allowed fields and map to postgres Snake Case
    const fieldMapping: Record<string, string> = {
      firstName: 'first_name',
      lastName: 'last_name',
      email: 'email',
      phone: 'phone',
      adultCount: 'adult_count',
      childCount: 'child_count',
      checkIn: 'check_in',
      checkOut: 'check_out',
      checkInTime: 'check_in_time',
      checkOutTime: 'check_out_time',
      selectedRooms: 'selected_rooms',
      selectedCottages: 'selected_cottages',
      selectedAmenities: 'selected_amenities',
      specialRequests: 'special_requests'
    };
    
    const updateData: any = { updated_at: new Date().toISOString() };
    for (const [frontendField, dbColumn] of Object.entries(fieldMapping)) {
      if (req.body[frontendField] !== undefined) {
        updateData[dbColumn] = req.body[frontendField];
      }
    }
    
    // Update the booking with whitelisted data only
    const { data: updatedBooking, error: updateError } = await supabaseAdmin
      .from("bookings")
      .update(updateData)
      .eq("id", bookingId)
      .select()
      .maybeSingle();
      
    if (updateError || !updatedBooking) {
      console.error("❌ Update error:", updateError);
      return res.status(500).json({ message: "Unable to update booking" });
    }
    
    // Format returned booking
    const formattedBooking = {
      ...updatedBooking,
      _id: updatedBooking.id,
      userId: updatedBooking.user_id,
      hotelId: updatedBooking.hotel_id,
      firstName: updatedBooking.first_name,
      lastName: updatedBooking.last_name,
      adultCount: updatedBooking.adult_count,
      childCount: updatedBooking.child_count,
      checkIn: updatedBooking.check_in,
      checkOut: updatedBooking.check_out,
      checkInTime: updatedBooking.check_in_time,
      checkOutTime: updatedBooking.check_out_time,
      totalCost: updatedBooking.total_cost,
      basePrice: updatedBooking.base_price,
      roomIds: updatedBooking.room_ids,
      cottageIds: updatedBooking.cottage_ids,
      selectedRooms: updatedBooking.selected_rooms,
      selectedAmenities: updatedBooking.selected_amenities,
      paymentMethod: updatedBooking.payment_method,
      paymentStatus: updatedBooking.payment_status,
      createdAt: updatedBooking.created_at,
      changeWindowDeadline: updatedBooking.change_window_deadline,
      canModify: updatedBooking.can_modify
    };
    
    res.status(200).json(formattedBooking);
  } catch (error) {
    console.error("Error updating booking:", error);
    res.status(500).json({ message: "Unable to update booking" });
  }
});

export default router;
