import fs from "fs";
import path from "path";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "./core/supabase";

function convertMongoIdToUuid(mongoId: string): string {
  if (mongoId.length === 24) {
    // Standard MongoDB ObjectId: pad with 8 zeros to make 32 hex chars, format as UUID
    return `${mongoId.substring(0, 8)}-${mongoId.substring(8, 12)}-${mongoId.substring(12, 16)}-${mongoId.substring(16, 20)}-${mongoId.substring(20)}00000000`;
  }
  
  // Non-standard hex or plain string: generate deterministic MD5 UUID
  const hash = crypto.createHash("md5").update(mongoId).digest("hex");
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20)}`;
}

function getDeterministicUuid(prefix: string, key: string): string {
  const hash = crypto.createHash("md5").update(`${prefix}:${key}`).digest("hex");
  return `${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20)}`;
}

async function runImport() {
  console.log("🚀 Starting MongoDB JSON Data Import to Supabase...");
  
  const usersPath = "C:\\Users\\charl\\Downloads\\json\\hotel-booking.users.json";
  const hotelsPath = "C:\\Users\\charl\\Downloads\\json\\hotel-booking.hotels2.json";

  if (!fs.existsSync(usersPath)) {
    console.error(`❌ Users JSON file not found at: ${usersPath}`);
    return;
  }
  if (!fs.existsSync(hotelsPath)) {
    console.error(`❌ Hotels JSON file not found at: ${hotelsPath}`);
    return;
  }

  // Read files
  const rawUsers = JSON.parse(fs.readFileSync(usersPath, "utf-8"));
  const rawHotels = JSON.parse(fs.readFileSync(hotelsPath, "utf-8"));

  console.log(`📋 Found ${rawUsers.length} users and ${rawHotels.length} hotels in JSON files.`);

  // 1. Fetch existing users from Supabase to construct mapping
  console.log("🔍 Fetching existing users from Supabase...");
  const { data: existingUsers, error: usersFetchError } = await supabaseAdmin
    .from("users")
    .select("id, email");

  if (usersFetchError) {
    console.error("❌ Failed to fetch existing users:", usersFetchError);
    return;
  }

  const emailToSupabaseIdMap = new Map<string, string>();
  for (const u of existingUsers || []) {
    emailToSupabaseIdMap.set(u.email.toLowerCase(), u.id);
  }

  const mongoUserIdToSupabaseUserIdMap = new Map<string, string>();

  // 2. Import/Upsert Users
  console.log("👤 Importing Users...");
  for (const user of rawUsers) {
    const mongoId = user._id?.$oid;
    if (!mongoId) {
      console.warn("⚠️ User record missing Mongo _id, skipping:", user);
      continue;
    }

    const email = user.email.toLowerCase();
    let supabaseId = emailToSupabaseIdMap.get(email);

    if (supabaseId) {
      console.log(`ℹ️ User with email ${email} already exists in Supabase. Mapping ID.`);
      mongoUserIdToSupabaseUserIdMap.set(mongoId, supabaseId);
    } else {
      // Create new user in Supabase
      supabaseId = convertMongoIdToUuid(mongoId);
      console.log(`➕ Inserting user: ${email} (ID: ${supabaseId})`);
      
      const pwd = user.password || crypto.randomBytes(16).toString("hex");
      // If the password starts with $2a$ or $2b$, it is already hashed. Keep it! Otherwise hash it.
      const hashedPassword = (pwd.startsWith("$2a$") || pwd.startsWith("$2b$")) 
        ? pwd 
        : await bcrypt.hash(pwd, 10);

      const birthdate = user.birthdate?.$date ? new Date(user.birthdate.$date).toISOString() : null;
      const createdAt = user.createdAt?.$date ? new Date(user.createdAt.$date).toISOString() : new Date().toISOString();
      const updatedAt = user.updatedAt?.$date ? new Date(user.updatedAt.$date).toISOString() : new Date().toISOString();

      const { error: insertError } = await supabaseAdmin
        .from("users")
        .insert({
          id: supabaseId,
          email: user.email,
          password: hashedPassword,
          first_name: user.firstName || "User",
          last_name: user.lastName || "Imported",
          role: user.role || "user",
          image: user.image || null,
          birthdate: birthdate,
          is_pwd: user.isPWD || false,
          pwd_id: null,
          pwd_id_verified: user.pwdIdVerified || false,
          account_verified: user.accountVerified || false,
          email_verified: user.emailVerified || false,
          created_at: createdAt,
          updated_at: updatedAt,
          must_change_password: user.mustChangePassword || false,
          is_active: user.isActive !== undefined ? user.isActive : true
        });

      if (insertError) {
        console.error(`❌ Failed to insert user ${email}:`, insertError);
      } else {
        mongoUserIdToSupabaseUserIdMap.set(mongoId, supabaseId);
        emailToSupabaseIdMap.set(email, supabaseId);
      }
    }
  }

  // Get fallback admin user ID
  let fallbackAdminId = emailToSupabaseIdMap.get("admin@glangetaway.com");
  if (!fallbackAdminId) {
    fallbackAdminId = existingUsers?.[0]?.id || Array.from(emailToSupabaseIdMap.values())[0];
  }

  console.log(`ℹ️ Using fallback owner ID: ${fallbackAdminId}`);

  // 3. Import Hotels, Rooms, Cottages, Amenities, Packages
  console.log("\n🏨 Importing Hotels and Accommodations...");
  for (const hotel of rawHotels) {
    const mongoHotelId = hotel._id?.$oid;
    if (!mongoHotelId) {
      console.warn("⚠️ Hotel record missing Mongo _id, skipping:", hotel);
      continue;
    }

    const hotelId = convertMongoIdToUuid(mongoHotelId);
    const hotelName = hotel.name;
    console.log(`🏨 Processing Resort: "${hotelName}" (ID: ${hotelId})`);

    // Map owner ID
    const oldUserId = hotel.userId;
    let ownerId = mongoUserIdToSupabaseUserIdMap.get(oldUserId) || fallbackAdminId;
    if (!ownerId) {
      console.warn(`⚠️ Could not resolve owner ID for hotel "${hotelName}". Defaulting to fallback admin.`);
      ownerId = fallbackAdminId;
    }

    const createdAt = hotel.createdAt?.$date ? new Date(hotel.createdAt.$date).toISOString() : new Date().toISOString();
    const updatedAt = hotel.updatedAt?.$date ? new Date(hotel.updatedAt.$date).toISOString() : new Date().toISOString();

    const hotelInsertData = {
      id: hotelId,
      user_id: ownerId,
      name: hotelName,
      city: hotel.city || "Glan",
      country: hotel.country || "Philippines",
      description: hotel.description || "",
      types: Array.isArray(hotel.type) ? hotel.type : [],
      facilities: Array.isArray(hotel.facilities) ? hotel.facilities : [],
      day_rate: hotel.dayRate || 0,
      night_rate: hotel.nightRate || 0,
      has_day_rate: hotel.hasDayRate !== undefined ? hotel.hasDayRate : false,
      has_night_rate: hotel.hasNightRate !== undefined ? hotel.hasNightRate : false,
      star_rating: hotel.starRating || 0,
      image_urls: Array.isArray(hotel.imageUrls) ? hotel.imageUrls : [],
      location: hotel.location || {},
      contact: hotel.contact || {},
      policies: hotel.policies || {},
      discounts: hotel.discounts || {},
      child_entrance_fee: hotel.childEntranceFee || [],
      adult_entrance_fee: hotel.adultEntranceFee || {},
      down_payment_percentage: hotel.downPaymentPercentage || 50,
      gcash_number: hotel.gcashNumber || null,
      is_approved: hotel.isApproved !== undefined ? hotel.isApproved : false,
      status: hotel.status || "pending",
      created_at: createdAt,
      updated_at: updatedAt
    };

    // Upsert Hotel
    const { error: hotelUpsertError } = await supabaseAdmin
      .from("hotels")
      .upsert(hotelInsertData);

    if (hotelUpsertError) {
      console.error(`❌ Failed to upsert hotel "${hotelName}":`, hotelUpsertError);
      continue;
    }
    console.log(`✅ Upserted hotel "${hotelName}"`);

    // Clean existing child relations to avoid duplication or constraint errors
    console.log(`🧹 Cleaning existing accommodations/amenities for "${hotelName}"...`);
    await supabaseAdmin.from("rooms").delete().eq("hotel_id", hotelId);
    await supabaseAdmin.from("cottages").delete().eq("hotel_id", hotelId);
    await supabaseAdmin.from("amenities").delete().eq("hotel_id", hotelId);
    await supabaseAdmin.from("packages").delete().eq("hotel_id", hotelId);

    // Track Room ID mappings (old ID string -> new UUID)
    const roomIdMap = new Map<string, string>();
    // Track Cottage ID mappings
    const cottageIdMap = new Map<string, string>();
    // Track Amenity ID mappings
    const amenityIdMap = new Map<string, string>();

    // 4. Insert Rooms
    if (Array.isArray(hotel.rooms) && hotel.rooms.length > 0) {
      console.log(`🛏️ Inserting ${hotel.rooms.length} rooms...`);
      const roomsToInsert = hotel.rooms.map((room: any) => {
        const generatedRoomId = getDeterministicUuid(hotelId, room.id);
        roomIdMap.set(room.id, generatedRoomId);
        
        return {
          id: generatedRoomId,
          hotel_id: hotelId,
          name: room.name,
          type: room.type || "Standard",
          price_per_night: room.pricePerNight || 0,
          min_occupancy: room.minOccupancy || 1,
          max_occupancy: room.maxOccupancy || 1,
          description: room.description || "",
          amenities: Array.isArray(room.amenities) ? room.amenities : [],
          image_url: room.imageUrl || "",
          included_entrance_fee: room.includedEntranceFee || { enabled: false, adultCount: 0, childCount: 0 }
        };
      });

      const { error: roomsError } = await supabaseAdmin
        .from("rooms")
        .insert(roomsToInsert);

      if (roomsError) {
        console.error(`❌ Failed to insert rooms for "${hotelName}":`, roomsError);
      } else {
        console.log(`   ✅ Rooms inserted`);
      }
    }

    // 5. Insert Cottages
    if (Array.isArray(hotel.cottages) && hotel.cottages.length > 0) {
      console.log(`🛖 Inserting ${hotel.cottages.length} cottages...`);
      const cottagesToInsert = hotel.cottages.map((cot: any) => {
        const generatedCottageId = getDeterministicUuid(hotelId, cot.id);
        cottageIdMap.set(cot.id, generatedCottageId);

        return {
          id: generatedCottageId,
          hotel_id: hotelId,
          name: cot.name,
          type: cot.type || "Standard",
          price_per_night: cot.pricePerNight || 0,
          day_rate: cot.dayRate || 0,
          night_rate: cot.nightRate || 0,
          has_day_rate: cot.hasDayRate !== undefined ? cot.hasDayRate : false,
          has_night_rate: cot.hasNightRate !== undefined ? cot.hasNightRate : false,
          min_occupancy: cot.minOccupancy || 1,
          max_occupancy: cot.maxOccupancy || 1,
          description: cot.description || "",
          amenities: Array.isArray(cot.amenities) ? cot.amenities : [],
          image_url: cot.imageUrl || "",
          included_entrance_fee: cot.includedEntranceFee || { enabled: false, adultCount: 0, childCount: 0 }
        };
      });

      const { error: cottagesError } = await supabaseAdmin
        .from("cottages")
        .insert(cottagesToInsert);

      if (cottagesError) {
        console.error(`❌ Failed to insert cottages for "${hotelName}":`, cottagesError);
      } else {
        console.log(`   ✅ Cottages inserted`);
      }
    }

    // 6. Insert Amenities
    if (Array.isArray(hotel.amenities) && hotel.amenities.length > 0) {
      console.log(`✨ Inserting ${hotel.amenities.length} amenities...`);
      const amenitiesToInsert = hotel.amenities.map((amenity: any) => {
        const generatedAmenityId = getDeterministicUuid(hotelId, amenity.id);
        amenityIdMap.set(amenity.id, generatedAmenityId);

        return {
          id: generatedAmenityId,
          hotel_id: hotelId,
          name: amenity.name,
          description: amenity.description || "",
          price: amenity.price || 0
        };
      });

      const { error: amenitiesError } = await supabaseAdmin
        .from("amenities")
        .insert(amenitiesToInsert);

      if (amenitiesError) {
        console.error(`❌ Failed to insert amenities for "${hotelName}":`, amenitiesError);
      } else {
        console.log(`   ✅ Amenities inserted`);
      }
    }

    // 7. Insert Packages
    if (Array.isArray(hotel.packages) && hotel.packages.length > 0) {
      console.log(`🎁 Inserting ${hotel.packages.length} packages...`);
      
      const packagesToInsert = hotel.packages.map((pkg: any) => {
        const generatedPackageId = getDeterministicUuid(hotelId, pkg.id);
        
        // Map original item strings to their newly generated UUIDs
        const mappedCottages = (pkg.includedCottages || [])
          .map((idStr: string) => cottageIdMap.get(idStr) || idStr);
        const mappedRooms = (pkg.includedRooms || [])
          .map((idStr: string) => roomIdMap.get(idStr) || idStr);
        const mappedAmenities = (pkg.includedAmenities || [])
          .map((idStr: string) => amenityIdMap.get(idStr) || idStr);

        return {
          id: generatedPackageId,
          hotel_id: hotelId,
          name: pkg.name,
          description: pkg.description || "",
          price: pkg.price || 0,
          image_url: pkg.imageUrl || "",
          included_cottages: mappedCottages,
          included_rooms: mappedRooms,
          included_amenities: mappedAmenities,
          included_child_entrance_fee: pkg.includedChildEntranceFee || false
        };
      });

      const { error: packagesError } = await supabaseAdmin
        .from("packages")
        .insert(packagesToInsert);

      if (packagesError) {
        console.error(`❌ Failed to insert packages for "${hotelName}":`, packagesError);
      } else {
        console.log(`   ✅ Packages inserted`);
      }
    }
  }

  console.log("\n🎉 Database JSON Data Import completed successfully!");
}

runImport();
