import { redirect } from "next/navigation";
import StatsClient from "./stats-client";
import { createSupabaseServerClient } from "@/lib/supabase";

function formatLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

export default async function StatsPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(end.getDate() - 6);

  const { data: logs } = await supabase
    .from("food_logs")
    .select("calories, consumed_at")
    .eq("user_id", session.user.id)
    .gte("consumed_at", start.toISOString())
    .lte("consumed_at", end.toISOString());

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("daily_calorie_target")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const calorieTarget = profile?.daily_calorie_target ?? 2000;

  const days: { [key: string]: number } = {};
  const cursor = new Date(start);
  for (let i = 0; i < 7; i++) {
    const key = cursor.toISOString().slice(0, 10);
    days[key] = 0;
    cursor.setDate(cursor.getDate() + 1);
  }

  logs?.forEach((log) => {
    const key = (log.consumed_at as string).slice(0, 10);
    days[key] = (days[key] ?? 0) + Number(log.calories ?? 0);
  });

  const chartData = Object.entries(days).map(([date, calories]) => ({
    label: formatLabel(new Date(date)),
    calories,
  }));

  return <StatsClient data={chartData} target={calorieTarget} />;
}
