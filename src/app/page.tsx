import { redirect } from "next/navigation";
import HomeClient from "./home-client";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(todayStart.getDate() + 1);

  const { data: logs, error } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", session.user.id)
    .gte("consumed_at", todayStart.toISOString())
    .lt("consumed_at", tomorrow.toISOString())
    .order("consumed_at", { ascending: false });

  if (error) {
    console.warn("Unable to load daily logs", error);
  }

  return (
    <HomeClient
      initialLogs={logs ?? []}
      userEmail={session.user.email ?? null}
    />
  );
}
