import { redirect } from "next/navigation";
import StatsClient from "./stats-client";
import WeightLogger from "../WeightLogger";
import WeightTrendChart from "./weight-trend-chart";
import { createSupabaseServerClient } from "@/lib/supabase";

function formatLabel(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

export default async function StatsPage() {
  const supabase = await createSupabaseServerClient();
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
  start.setHours(0, 0, 0, 0);
  const weightRangeStart = new Date(end);
  weightRangeStart.setHours(0, 0, 0, 0);
  weightRangeStart.setDate(end.getDate() - 29);

  const { data: logs } = await supabase
    .from("food_logs")
    .select("calories, protein, carbs, fat, fiber, sodium, consumed_at")
    .eq("user_id", session.user.id)
    .gte("consumed_at", start.toISOString())
    .lte("consumed_at", end.toISOString());

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("daily_calorie_target")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!profile || profile.daily_calorie_target === null || profile.daily_calorie_target === 0) {
    redirect("/onboarding");
  }

  const calorieTarget = profile?.daily_calorie_target ?? 2000;

  const days: {
    [key: string]: {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      fiber: number;
      sodium: number;
    };
  } = {};
  const cursor = new Date(start);
  for (let i = 0; i < 7; i++) {
    const key = cursor.toISOString().slice(0, 10);
    days[key] = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 };
    cursor.setDate(cursor.getDate() + 1);
  }

  logs?.forEach((log) => {
    const key = (log.consumed_at as string).slice(0, 10);
    const entry = days[key] ?? {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      sodium: 0,
    };
    entry.calories = (entry.calories ?? 0) + Number(log.calories ?? 0);
    entry.protein = (entry.protein ?? 0) + Number(log.protein ?? 0);
    entry.carbs = (entry.carbs ?? 0) + Number(log.carbs ?? 0);
    entry.fat = (entry.fat ?? 0) + Number(log.fat ?? 0);
    entry.fiber = (entry.fiber ?? 0) + Number(log.fiber ?? 0);
    entry.sodium = (entry.sodium ?? 0) + Number(log.sodium ?? 0);
    days[key] = entry;
  });

  const { data: weightLogs } = await supabase
    .from("weight_logs")
    .select("weight_kg, logged_at")
    .eq("user_id", session.user.id)
    .gte("logged_at", weightRangeStart.toISOString())
    .lte("logged_at", end.toISOString())
    .order("logged_at", { ascending: true });

  const weightByDay: Record<string, number> = {};
  weightLogs?.forEach((row) => {
    const loggedAt = new Date(row.logged_at as string);
    if (loggedAt < start) return;
    const key = (row.logged_at as string).slice(0, 10);
    weightByDay[key] = Number(row.weight_kg);
  });

  const chartData = Object.entries(days).map(([date, totals]) => ({
    label: formatLabel(new Date(date)),
    calories: totals.calories,
    protein: totals.protein,
    carbs: totals.carbs,
    fat: totals.fat,
    fiber: totals.fiber,
    sodium: totals.sodium,
    weight: weightByDay[date] ?? null,
  }));

  const latestWeight =
    weightLogs && weightLogs.length
      ? Number(weightLogs[weightLogs.length - 1].weight_kg)
      : null;

  const weightChartData =
    weightLogs?.map((row) => {
      const loggedAt = new Date(row.logged_at as string);
      return {
        date: loggedAt.toISOString(),
        label: loggedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        weight: Number(row.weight_kg),
      };
    }) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <StatsClient data={chartData} target={calorieTarget} />
        <WeightTrendChart data={weightChartData} />
      </div>
      <WeightLogger defaultWeight={latestWeight} />
    </div>
  );
}
