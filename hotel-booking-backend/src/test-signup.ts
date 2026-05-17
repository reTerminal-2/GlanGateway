import { supabase } from "./core/supabase";

async function run() {
  const email = `test-user-${Date.now()}@example.com`;
  const password = "password123";
  const firstName = "Test";
  const lastName = "User";

  console.log(`📡 Attempting direct Supabase Auth signUp for: ${email}`);
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        firstName,
        lastName,
        role: "user"
      }
    }
  });

  if (error) {
    console.error("❌ Direct SignUp Error:", error);
  } else {
    console.log("✅ Direct SignUp Success! User:", data.user);
  }
}

run().catch(console.error);
