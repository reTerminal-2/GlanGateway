export function formatHotelDbToApi(
  h: any,
  rooms: any[] = [],
  cottages: any[] = [],
  amenities: any[] = [],
  packages: any[] = []
) {
  if (!h) return null;

  // Process the types/type field robustly
  let typeArray: string[] = [];
  const rawType = h.types || h.type;
  if (Array.isArray(rawType)) {
    for (const t of rawType) {
      if (typeof t === 'string' && t.startsWith('[') && t.endsWith(']')) {
        try {
          const parsed = JSON.parse(t);
          if (Array.isArray(parsed)) {
            typeArray.push(...parsed);
          } else {
            typeArray.push(t);
          }
        } catch {
          typeArray.push(t);
        }
      } else if (typeof t === 'string') {
        typeArray.push(t);
      }
    }
  } else if (typeof rawType === 'string') {
    if (rawType.startsWith('[') && rawType.endsWith(']')) {
      try {
        const parsed = JSON.parse(rawType);
        if (Array.isArray(parsed)) {
          typeArray.push(...parsed);
        } else {
          typeArray.push(rawType);
        }
      } catch {
        typeArray.push(rawType);
      }
    } else {
      typeArray.push(rawType);
    }
  }
  // Keep unique types and filter empty strings
  typeArray = Array.from(new Set(typeArray.map(t => t.trim()).filter(Boolean)));

  // Extract day and night check-in/out times from policies JSON if available
  const dayRateCheckInTime = h.day_rate_check_in_time || h.policies?.dayCheckInTime || h.policies?.checkInTime || "01:00 PM";
  const dayRateCheckOutTime = h.day_rate_check_out_time || h.policies?.dayCheckOutTime || h.policies?.checkOutTime || "11:00 AM";
  const nightRateCheckInTime = h.night_rate_check_in_time || h.policies?.nightCheckInTime || h.policies?.checkInTime || "02:00 PM";
  const nightRateCheckOutTime = h.night_rate_check_out_time || h.policies?.nightCheckOutTime || h.policies?.checkOutTime || "11:00 AM";

  // Formatter for image URLs (convert localhost URLs if needed, but primarily make sure it's valid)
  const imageUrls = Array.isArray(h.image_urls) ? h.image_urls : (h.imageUrls || []);

  return {
    ...h,
    _id: h.id,
    id: h.id,
    userId: h.user_id || h.userId,
    name: h.name,
    city: h.city,
    country: h.country,
    description: h.description,
    type: typeArray, // Map to camelCase 'type' for frontend compatibility
    facilities: h.facilities || [],
    dayRate: h.day_rate !== undefined && h.day_rate !== null ? parseFloat(h.day_rate) : (h.dayRate || 0),
    nightRate: h.night_rate !== undefined && h.night_rate !== null ? parseFloat(h.night_rate) : (h.nightRate || 0),
    hasDayRate: h.has_day_rate !== undefined ? h.has_day_rate : (h.hasDayRate || false),
    hasNightRate: h.has_night_rate !== undefined ? h.has_night_rate : (h.hasNightRate || false),
    dayRateCheckInTime,
    dayRateCheckOutTime,
    nightRateCheckInTime,
    nightRateCheckOutTime,
    starRating: h.star_rating !== undefined && h.star_rating !== null ? parseFloat(h.star_rating) : (h.starRating || 0),
    imageUrls: imageUrls,
    location: h.location || {},
    contact: h.contact || {},
    policies: h.policies || {},
    discounts: h.discounts || {},
    childEntranceFee: h.child_entrance_fee || h.childEntranceFee || [],
    adultEntranceFee: h.adult_entrance_fee || h.adultEntranceFee || {},
    downPaymentPercentage: h.down_payment_percentage !== undefined && h.down_payment_percentage !== null ? parseFloat(h.down_payment_percentage) : (h.downPaymentPercentage || 50),
    gcashNumber: h.gcash_number || h.gcashNumber || "",
    isApproved: h.is_approved !== undefined ? h.is_approved : (h.isApproved || false),
    status: h.status || "pending",
    lastUpdated: h.updated_at || h.created_at || h.lastUpdated || new Date().toISOString(),
    rooms: (rooms || []).map((r: any) => ({
      ...r,
      _id: r.id,
      id: r.id,
      pricePerNight: r.price_per_night !== undefined && r.price_per_night !== null ? parseFloat(r.price_per_night) : (r.pricePerNight || 0),
      minOccupancy: r.min_occupancy || r.minOccupancy || 1,
      maxOccupancy: r.max_occupancy || r.maxOccupancy || 1,
      imageUrl: r.image_url || r.imageUrl || "",
      includedEntranceFee: r.included_entrance_fee || r.includedEntranceFee || { enabled: false, adultCount: 0, childCount: 0 }
    })),
    cottages: (cottages || []).map((c: any) => ({
      ...c,
      _id: c.id,
      id: c.id,
      pricePerNight: c.price_per_night !== undefined && c.price_per_night !== null ? parseFloat(c.price_per_night) : (c.pricePerNight || 0),
      dayRate: c.day_rate !== undefined && c.day_rate !== null ? parseFloat(c.day_rate) : (c.dayRate || 0),
      nightRate: c.night_rate !== undefined && c.night_rate !== null ? parseFloat(c.night_rate) : (c.nightRate || 0),
      hasDayRate: c.has_day_rate !== undefined ? c.has_day_rate : (c.hasDayRate || false),
      hasNightRate: c.has_night_rate !== undefined ? c.has_night_rate : (c.hasNightRate || false),
      minOccupancy: c.min_occupancy || c.minOccupancy || 1,
      maxOccupancy: c.max_occupancy || c.maxOccupancy || 1,
      imageUrl: c.image_url || c.imageUrl || "",
      includedEntranceFee: c.included_entrance_fee || c.includedEntranceFee || { enabled: false, adultCount: 0, childCount: 0 }
    })),
    amenities: (amenities || []).map((a: any) => ({
      ...a,
      _id: a.id,
      id: a.id,
      price: a.price !== undefined && a.price !== null ? parseFloat(a.price) : (a.price || 0),
      imageUrl: a.image_url || a.imageUrl || ""
    })),
    packages: (packages || []).map((p: any) => ({
      ...p,
      _id: p.id,
      id: p.id,
      price: p.price !== undefined && p.price !== null ? parseFloat(p.price) : (p.price || 0),
      imageUrl: p.image_url || p.imageUrl || "",
      includedCottages: p.included_cottages || p.includedCottages || [],
      includedRooms: p.included_rooms || p.includedRooms || [],
      includedAmenities: p.included_amenities || p.includedAmenities || [],
      includedChildEntranceFee: p.included_child_entrance_fee !== undefined ? p.included_child_entrance_fee : (p.includedChildEntranceFee || false)
    }))
  };
}
