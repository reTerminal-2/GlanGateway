import express, { Request, Response } from "express";
import verifyToken from "../middleware/auth";
import { supabaseAdmin } from "../core/supabase";
import { subDays, startOfMonth, format } from "date-fns";

const router = express.Router();

// Helper function to calculate date range
function getDateRange(timeRange: string) {
  const now = new Date();
  let startDate: Date;

  switch (timeRange) {
    case '7d':
      startDate = subDays(now, 7);
      break;
    case '30d':
      startDate = subDays(now, 30);
      break;
    case '90d':
      startDate = subDays(now, 90);
      break;
    case '1y':
      startDate = subDays(now, 365);
      break;
    default:
      startDate = subDays(now, 30);
  }

  return { startDate, endDate: now };
}

// Helper function to calculate previous period for growth comparison
function getPreviousPeriod(timeRange: string) {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;

  switch (timeRange) {
    case '7d':
      endDate = subDays(now, 7);
      startDate = subDays(endDate, 7);
      break;
    case '30d':
      endDate = subDays(now, 30);
      startDate = subDays(endDate, 30);
      break;
    case '90d':
      endDate = subDays(now, 90);
      startDate = subDays(endDate, 90);
      break;
    case '1y':
      endDate = subDays(now, 365);
      startDate = subDays(endDate, 365);
      break;
    default:
      endDate = subDays(now, 30);
      startDate = subDays(endDate, 30);
  }

  return { startDate, endDate };
}

// Calculate growth percentage
function calculateGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

router.get("/business-stats", verifyToken, async (req: Request, res: Response) => {
  try {
    const timeRange = req.query.timeRange as string || '30d';
    const { startDate, endDate } = getDateRange(timeRange);
    const { startDate: prevStartDate, endDate: prevEndDate } = getPreviousPeriod(timeRange);

    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();
    const prevStartISO = prevStartDate.toISOString();
    const prevEndISO = prevEndDate.toISOString();

    console.log("Fetching business stats for timeRange:", timeRange);

    // ── Current period counts ──
    const [
      { count: totalUsers },
      { count: totalResorts },
      { count: totalBookings },
    ] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startISO)
        .lte("created_at", endISO),
      supabaseAdmin
        .from("hotels")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startISO)
        .lte("created_at", endISO),
      supabaseAdmin
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .gte("created_at", startISO)
        .lte("created_at", endISO),
    ]);

    // ── Previous period counts ──
    const [
      { count: prevUsers },
      { count: prevResorts },
      { count: prevBookings },
    ] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevStartISO)
        .lte("created_at", prevEndISO),
      supabaseAdmin
        .from("hotels")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevStartISO)
        .lte("created_at", prevEndISO),
      supabaseAdmin
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .gte("created_at", prevStartISO)
        .lte("created_at", prevEndISO),
    ]);

    // ── Total counts (all time) ──
    const { count: allTimeUsers } = await supabaseAdmin
      .from("users")
      .select("*", { count: "exact", head: true });

    const { count: allTimeResorts } = await supabaseAdmin
      .from("hotels")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");

    // ── Revenue in current period ──
    const { data: currentBookings } = await supabaseAdmin
      .from("bookings")
      .select("total_cost")
      .gte("created_at", startISO)
      .lte("created_at", endISO);

    const totalRevenue = (currentBookings || []).reduce(
      (sum: number, b: any) => sum + (Number(b.total_cost) || 0),
      0
    );

    // ── Revenue in previous period ──
    const { data: prevBookingData } = await supabaseAdmin
      .from("bookings")
      .select("total_cost")
      .gte("created_at", prevStartISO)
      .lte("created_at", prevEndISO);

    const prevRevenue = (prevBookingData || []).reduce(
      (sum: number, b: any) => sum + (Number(b.total_cost) || 0),
      0
    );

    // ── Average rating ──
    const { data: ratedResorts } = await supabaseAdmin
      .from("hotels")
      .select("star_rating")
      .eq("status", "approved");

    const totalRating = (ratedResorts || []).reduce(
      (sum: number, r: any) => sum + (Number(r.star_rating) || 0),
      0
    );
    const averageRating = ratedResorts && ratedResorts.length > 0
      ? totalRating / ratedResorts.length
      : 0;

    // ── Occupancy rate (simplified) ──
    const occupancyRate = (allTimeResorts || 0) > 0
      ? ((totalBookings || 0) / ((allTimeResorts || 1) * 30)) * 100
      : 0;

    // ── Top performing resorts ──
    let topPerformingResorts: any[] = [];
    try {
      const { data: topBookings } = await supabaseAdmin
        .from("bookings")
        .select("hotel_id, total_cost")
        .gte("created_at", startISO)
        .lte("created_at", endISO);

      // Group by hotel_id manually
      const hotelStats: Record<string, { totalBookings: number; totalRevenue: number }> = {};
      (topBookings || []).forEach((b: any) => {
        if (!hotelStats[b.hotel_id]) {
          hotelStats[b.hotel_id] = { totalBookings: 0, totalRevenue: 0 };
        }
        hotelStats[b.hotel_id].totalBookings += 1;
        hotelStats[b.hotel_id].totalRevenue += Number(b.total_cost) || 0;
      });

      // Sort by revenue and take top 5
      const sortedHotelIds = Object.entries(hotelStats)
        .sort((a, b) => b[1].totalRevenue - a[1].totalRevenue)
        .slice(0, 5);

      if (sortedHotelIds.length > 0) {
        const hotelIds = sortedHotelIds.map(([id]) => id);
        const { data: hotels } = await supabaseAdmin
          .from("hotels")
          .select("id, name, star_rating")
          .in("id", hotelIds);

        const hotelMap: Record<string, any> = {};
        (hotels || []).forEach((h: any) => { hotelMap[h.id] = h; });

        topPerformingResorts = sortedHotelIds.map(([id, stats]) => ({
          _id: id,
          name: hotelMap[id]?.name || "Unknown Resort",
          totalBookings: stats.totalBookings,
          totalRevenue: stats.totalRevenue,
          averageRating: hotelMap[id]?.star_rating || 0,
          occupancyRate: 0,
        }));
      }
    } catch (err) {
      console.error("Error fetching top performing resorts:", err);
    }

    // ── Recent bookings ──
    let recentBookingsFormatted: any[] = [];
    try {
      const { data: recentBookings } = await supabaseAdmin
        .from("bookings")
        .select("id, hotel_id, user_id, first_name, last_name, total_cost, status, created_at")
        .order("created_at", { ascending: false })
        .limit(10);

      if (recentBookings && recentBookings.length > 0) {
        // Fetch hotel names
        const hotelIds = [...new Set(recentBookings.map((b: any) => b.hotel_id))];
        const { data: hotels } = await supabaseAdmin
          .from("hotels")
          .select("id, name")
          .in("id", hotelIds);

        const hotelMap: Record<string, string> = {};
        (hotels || []).forEach((h: any) => { hotelMap[h.id] = h.name; });

        recentBookingsFormatted = recentBookings.map((booking: any) => ({
          _id: booking.id,
          hotelName: hotelMap[booking.hotel_id] || "Unknown",
          userName: `${booking.first_name || ""} ${booking.last_name || ""}`.trim(),
          totalCost: Number(booking.total_cost) || 0,
          status: booking.status || "pending",
          createdAt: booking.created_at,
        }));
      }
    } catch (err) {
      console.error("Error fetching recent bookings:", err);
    }

    // ── User distribution ──
    let userDistribution = { users: 0, admins: 0, superAdmins: 0 };
    try {
      const [
        { count: userCount },
        { count: ownerCount },
        { count: adminCount },
      ] = await Promise.all([
        supabaseAdmin.from("users").select("*", { count: "exact", head: true }).eq("role", "user"),
        supabaseAdmin.from("users").select("*", { count: "exact", head: true }).eq("role", "resort_owner"),
        supabaseAdmin.from("users").select("*", { count: "exact", head: true }).in("role", ["admin", "superAdmin"]),
      ]);
      userDistribution = {
        users: userCount || 0,
        admins: ownerCount || 0,
        superAdmins: adminCount || 0,
      };
    } catch (err) {
      console.error("Error fetching user distribution:", err);
    }

    // ── Revenue by month (last 6 months) ──
    const revenueByMonth: any[] = [];
    try {
      for (let i = 5; i >= 0; i--) {
        const monthStart = startOfMonth(subDays(new Date(), i * 30));
        const monthEnd = new Date(monthStart);
        monthEnd.setMonth(monthEnd.getMonth() + 1);

        const { data: monthBookings } = await supabaseAdmin
          .from("bookings")
          .select("total_cost")
          .gte("created_at", monthStart.toISOString())
          .lt("created_at", monthEnd.toISOString());

        const monthRevenue = (monthBookings || []).reduce(
          (sum: number, b: any) => sum + (Number(b.total_cost) || 0),
          0
        );

        revenueByMonth.push({
          month: format(monthStart, "MMM yyyy"),
          revenue: monthRevenue,
          bookings: (monthBookings || []).length,
        });
      }
    } catch (err) {
      console.error("Error calculating revenue by month:", err);
    }

    // ── Popular destinations ──
    let popularDestinations: any[] = [];
    try {
      const { data: bookingsWithHotels } = await supabaseAdmin
        .from("bookings")
        .select("hotel_id")
        .gte("created_at", startISO)
        .lte("created_at", endISO);

      if (bookingsWithHotels && bookingsWithHotels.length > 0) {
        const hotelIds = [...new Set(bookingsWithHotels.map((b: any) => b.hotel_id))];
        const { data: hotels } = await supabaseAdmin
          .from("hotels")
          .select("id, city, country")
          .in("id", hotelIds);

        // Count bookings per city
        const cityStats: Record<string, { city: string; country: string; totalBookings: number; resortIds: Set<string> }> = {};
        (bookingsWithHotels || []).forEach((b: any) => {
          const hotel = (hotels || []).find((h: any) => h.id === b.hotel_id);
          if (hotel) {
            const key = `${hotel.city}-${hotel.country}`;
            if (!cityStats[key]) {
              cityStats[key] = { city: hotel.city, country: hotel.country, totalBookings: 0, resortIds: new Set() };
            }
            cityStats[key].totalBookings += 1;
            cityStats[key].resortIds.add(b.hotel_id);
          }
        });

        popularDestinations = Object.values(cityStats)
          .map(s => ({ city: s.city, country: s.country, totalBookings: s.totalBookings, resortCount: s.resortIds.size }))
          .sort((a, b) => b.totalBookings - a.totalBookings)
          .slice(0, 5);
      }
    } catch (err) {
      console.error("Error in popularDestinations:", err);
    }

    const response = {
      totalUsers: allTimeUsers || 0,
      totalResorts: allTimeResorts || 0,
      totalBookings: totalBookings || 0,
      totalRevenue,
      averageRating,
      occupancyRate: Math.min(occupancyRate, 100),
      monthlyGrowth: {
        users: calculateGrowth(totalUsers || 0, prevUsers || 0),
        resorts: calculateGrowth(totalResorts || 0, prevResorts || 0),
        bookings: calculateGrowth(totalBookings || 0, prevBookings || 0),
        revenue: calculateGrowth(totalRevenue, prevRevenue),
      },
      topPerformingResorts,
      recentBookings: recentBookingsFormatted,
      userDistribution,
      revenueByMonth,
      popularDestinations,
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching business stats:", error);
    res.status(500).json({
      message: "Something went wrong",
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

// Import the edit hotel form route
import editHotelFormRouter from './edit-hotel-form';

// Mount the edit hotel form router
router.use('/edit-hotel', editHotelFormRouter);

export default router;
