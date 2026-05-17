import { supabaseAdmin } from "./core/supabase";

async function run() {
  console.log("📡 Adding adult_entrance_fee column to public.hotels via Supabase RPC/REST is limited.");
  console.log("Please run this in the Supabase SQL editor:");
  console.log("ALTER TABLE public.hotels ADD COLUMN IF NOT EXISTS adult_entrance_fee JSONB DEFAULT '{}'::jsonb;");
  
  // Actually we can just do a raw SQL execute if we want to add the pg library, 
  // but let's just use supabaseAdmin.rpc if there's an exec sql function, 
  // or we can just ask the user to run it.
}

run();
