-- Supabase Schema for GlanGetaway Booking Platform
-- Paste this script into the Supabase SQL Editor and hit "Run"

-- Enable UUID extension (usually enabled by default)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. HOTELS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.hotels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL, -- Assuming user IDs come from Clerk or Supabase Auth as text/uuid
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL,
  description TEXT NOT NULL,
  types TEXT[] DEFAULT '{}',
  facilities TEXT[] DEFAULT '{}',
  day_rate DECIMAL(10, 2) DEFAULT 0,
  night_rate DECIMAL(10, 2) DEFAULT 0,
  has_day_rate BOOLEAN DEFAULT false,
  has_night_rate BOOLEAN DEFAULT false,
  star_rating DECIMAL(3, 1) DEFAULT 0,
  image_urls TEXT[] DEFAULT '{}',
  location JSONB DEFAULT '{}'::jsonb,
  contact JSONB DEFAULT '{}'::jsonb,
  policies JSONB DEFAULT '{}'::jsonb,
  discounts JSONB DEFAULT '{}'::jsonb,
  child_entrance_fee JSONB DEFAULT '[]'::jsonb,
  adult_entrance_fee JSONB DEFAULT '{}'::jsonb,
  down_payment_percentage DECIMAL(5, 2) DEFAULT 50,
  gcash_number TEXT,
  is_approved BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 2. ROOMS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  price_per_night DECIMAL(10, 2) DEFAULT 0,
  min_occupancy INTEGER DEFAULT 1,
  max_occupancy INTEGER DEFAULT 1,
  description TEXT,
  amenities TEXT[] DEFAULT '{}',
  image_url TEXT,
  included_entrance_fee JSONB DEFAULT '{"enabled": false, "adultCount": 0, "childCount": 0}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 3. COTTAGES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.cottages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  price_per_night DECIMAL(10, 2) DEFAULT 0,
  day_rate DECIMAL(10, 2) DEFAULT 0,
  night_rate DECIMAL(10, 2) DEFAULT 0,
  has_day_rate BOOLEAN DEFAULT false,
  has_night_rate BOOLEAN DEFAULT false,
  min_occupancy INTEGER DEFAULT 1,
  max_occupancy INTEGER DEFAULT 1,
  description TEXT,
  amenities TEXT[] DEFAULT '{}',
  image_url TEXT,
  included_entrance_fee JSONB DEFAULT '{"enabled": false, "adultCount": 0, "childCount": 0}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 4. BOOKINGS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL, -- Optional, if booking a specific room
  check_in TIMESTAMP WITH TIME ZONE NOT NULL,
  check_out TIMESTAMP WITH TIME ZONE NOT NULL,
  adult_count INTEGER DEFAULT 1,
  child_count INTEGER DEFAULT 0,
  total_cost DECIMAL(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'confirmed', 'cancelled', 'completed'
  payment_status TEXT DEFAULT 'pending', -- 'pending', 'paid', 'partially_paid', 'failed'
  payment_method TEXT, -- 'card', 'gcash', 'cash'
  payment_intent_id TEXT,
  gcash_reference TEXT,
  selected_cottages JSONB DEFAULT '[]'::jsonb,
  special_requests TEXT,
  change_window_deadline TIMESTAMP WITH TIME ZONE,
  can_modify BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 5. STORAGE BUCKET FOR IMAGES
-- ==========================================
-- Insert the bucket required for imageService.ts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('resort-images', 'resort-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policy: Allow public read access to images
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'resort-images');

-- Storage Policy: Allow authenticated insert access
DROP POLICY IF EXISTS "Auth Insert" ON storage.objects;
CREATE POLICY "Auth Insert" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'resort-images');

-- ==========================================
-- 6. RESORT OWNER APPLICATIONS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.resort_owner_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  dti_permit_url TEXT,
  municipal_engineering_cert_url TEXT,
  municipal_health_cert_url TEXT,
  menro_cert_url TEXT,
  bfp_permit_url TEXT,
  business_permit_url TEXT,
  national_id_url TEXT,
  rejection_reason TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 7. AMENITIES & SLOTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.amenities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.amenity_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  amenity_id UUID REFERENCES public.amenities(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  is_booked BOOLEAN DEFAULT false,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 8. PRICING RULES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  multiplier DECIMAL(5, 2) DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 9. ROOM BLOCKS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS public.room_blocks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 10. VERIFICATIONS & COMPLIANCE TABLES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.identity_verifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  document_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.compliance_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'compliant',
  issues TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.verification_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 11. STAFF & MAINTENANCE TABLES
-- ==========================================
CREATE TABLE IF NOT EXISTS public.resort_staff (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.housekeeping_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES public.resort_staff(id) ON DELETE SET NULL,
  task_type TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.housekeeping_maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  issue_description TEXT NOT NULL,
  status TEXT DEFAULT 'reported',
  reported_by TEXT NOT NULL,
  resolved_by UUID REFERENCES public.resort_staff(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==========================================
-- 12. MISC TABLES (BILLING, FEEDBACK, WEATHER)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id UUID REFERENCES public.bookings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  status TEXT DEFAULT 'unpaid',
  due_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.role_promotion_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT NOT NULL,
  requested_role TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.website_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT,
  rating INTEGER,
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.weather_triggers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  condition TEXT NOT NULL,
  action TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
