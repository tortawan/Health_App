import { redirect } from "next/navigation";
import HomeClient from "./home-client";
import { createSupabaseServerClient } from "@/lib/supabase";

type UserProfile = {
  user_id: string;
  height: number | null;
  weight: number | null;
  age: number | null;
  activity_level: string | null;
  goal_type: string | null;
  macro_split: Record<string, unknown> | null;
  daily_calorie_target: number | null;
  daily_protein_target: number | null;
};

function parseDateParam(dateValue?: string | string[]) {
  if (!dateValue || Array.isArray(dateValue)) return new Date();

  const [year, month, day] = dateValue.split("-").map(Number);

  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function formatDateParam(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
}

function calculateStreak(logDates: string[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const uniqueDays = Array.from(
    new Set(
      logDates.map((date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      }),
    ),
  ).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  let streak = 0;
  let cursor = today;

  for (const iso of uniqueDays) {
    const day = new Date(iso);
    if (day.getTime() === cursor.getTime()) {
      streak += 1;
      cursor = new Date(cursor);
      cursor.setDate(cursor.getDate() - 1);
    } else if (day.getTime() > cursor.getTime()) {
      continue;
    } else {
      break;
    }
  }

  return streak;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const supabase = createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const requestedDate = parseDateParam(searchParams?.date);
  const dayStart = new Date(requestedDate);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(dayStart.getDate() + 1);

  const { data: logs, error } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", session.user.id)
    .gte("consumed_at", dayStart.toISOString())
    .lt("consumed_at", nextDay.toISOString())
    .order("consumed_at", { ascending: false });

  if (error) {
    console.warn("Unable to load daily logs", error);
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", session.user.id)
    .maybeSingle();

  const { data: streakLogs } = await supabase
    .from("food_logs")
    .select("consumed_at")
    .eq("user_id", session.user.id)
    .order("consumed_at", { ascending: false })
    .limit(60);

  const streak = streakLogs
    ? calculateStreak(streakLogs.map((row) => row.consumed_at as string))
    : 0;

  return (
    <HomeClient
      initialLogs={logs ?? []}
      userEmail={session.user.email ?? null}
      selectedDate={formatDateParam(dayStart)}
      profile={profile as UserProfile | null}
      streak={streak}
    />
  );
}
