// Availability service - migrated to Supabase
// This module previously relied on Mongoose Booking model.
// Now it queries Supabase directly.

import { supabaseAdmin } from '../core/supabase';

export async function checkAvailability(hotelId: string, checkIn: Date, checkOut: Date) {
  const { data: bookings, error } = await supabaseAdmin
    .from('bookings')
    .select('*')
    .eq('hotel_id', hotelId)
    .or(`check_in.lte.${checkOut.toISOString()},check_out.gte.${checkIn.toISOString()}`);

  if (error) {
    console.error('Availability check error:', error);
    throw error;
  }

  return bookings || [];
}