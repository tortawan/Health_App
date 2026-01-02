import { redirect } from "next/navigation";
import LoginClient from "./login-client";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function LoginPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    redirect("/");
  }

  return <LoginClient />;
}
