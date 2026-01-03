import { redirect } from "next/navigation";
import HomeClient from "./home-client";
import { createSupabaseServerClient } from "@/lib/supabase";

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

  return (
    <HomeClient
      initialLogs={logs ?? []}
      userEmail={session.user.email ?? null}
      selectedDate={formatDateParam(dayStart)}
    />
  );
}
