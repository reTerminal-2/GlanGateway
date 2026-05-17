import { supabaseAdmin } from "./core/supabase";
import bcrypt from "bcryptjs";
import crypto from "crypto";

async function run() {
  const email = "charlieyuu911@gmail.com";
  const password = "chokoy2020";
  const firstName = "Charlie";
  const lastName = "Yuu";
  const role = "resort_owner";

  console.log(`📡 Checking if account with email ${email} already exists...`);
  const { data: existingUser, error: checkError } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (checkError) {
    console.error("❌ Database check error:", checkError);
  }

  if (existingUser) {
    console.log(`📡 Account already exists with ID: ${existingUser.id}. Updating it with resort_owner role and new password...`);
    const hashedPassword = await bcrypt.hash(password, 10);
    const { error: updateError } = await supabaseAdmin
      .from("users")
      .update({
        role,
        password: hashedPassword,
        first_name: firstName,
        last_name: lastName,
        account_verified: true,
        email_verified: true
      })
      .eq("id", existingUser.id);

    if (updateError) {
      console.error("❌ Failed to update owner profile:", updateError.message);
    } else {
      console.log("✅ Resort owner account successfully updated!");
    }
    return;
  }

  console.log("📡 Creating a fresh resort owner account...");
  const userId = crypto.randomUUID();
  const hashedPassword = await bcrypt.hash(password, 10);

  const { error: insertError } = await supabaseAdmin
    .from("users")
    .insert({
      id: userId,
      email,
      password: hashedPassword,
      first_name: firstName,
      last_name: lastName,
      role,
      birthdate: "1995-01-01",
      is_pwd: false,
      pwd_id: null,
      pwd_id_verified: false,
      account_verified: true,
      email_verified: true
    });

  if (insertError) {
    console.error("❌ Failed to create resort owner account:", insertError.message);
  } else {
    console.log("✅ Resort owner account successfully created!");
    console.log(`Owner Details:\nID: ${userId}\nEmail: ${email}\nRole: ${role}`);
  }
}

run().catch(console.error);
