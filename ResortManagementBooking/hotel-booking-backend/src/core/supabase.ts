import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
  throw new Error('❌ Missing Supabase configuration variables in .env');
}

// 1. General client (honors database RLS and triggers)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. Admin client (bypasses RLS - use only for superAdmin overrides or system tasks)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

console.log("⚡ Supabase Client initialized successfully for qoncowrxrsxrhgwxfvad");
