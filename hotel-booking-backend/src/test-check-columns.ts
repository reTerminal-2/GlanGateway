import { supabaseAdmin } from "./core/supabase";
import crypto from "crypto";

async function run() {
  const userId = crypto.randomUUID();
  console.log(`📡 Trying test insert into public.users with ID: ${userId}...`);
  const { data, error } = await supabaseAdmin
    .from("users")
    .insert({
      id: userId,
      email: `test-insert-${Date.now()}@example.com`,
      password: "test-hashed-password",
      first_name: "Test",
      last_name: "User",
      role: 'user',
      birthdate: '2000-01-01',
      is_pwd: false,
      pwd_id: null,
      pwd_id_verified: false,
      account_verified: false,
      email_verified: true
    });

  console.log("Insert Result:", { data, error });
}

run().catch(console.error);
