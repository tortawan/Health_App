import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  
  // 1. Authenticate
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // 2. Insert into Supabase
    // We explicitly select() to get the returned data (required for the UI update)
    const { data, error } = await supabase
      .from("food_logs")
      .insert({
        ...body,
        user_id: user.id, // Ensure security by forcing the user ID
      })
      .select();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 3. Return the standard format expected by our frontend/test
    return NextResponse.json({ 
      success: true, 
      message: "Entry added", 
      data: data // Supabase .select() returns an array
    }, { status: 201 });

  } catch (err) {
    console.error("Server error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}