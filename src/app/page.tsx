import { redirect } from "next/navigation";
import HomeClient from "./home-client";
import { createSupabaseServerClient } from "@/lib/supabase";
import { MealTemplate, PortionMemoryRow, UserProfile } from "@/types/food";
import { getWeightHistory } from "./actions/weight";
import WeightLogger from "./WeightLogger";

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
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createSupabaseServerClient();
   
  // FIX: Use getUser() instead of getSession() for security
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const requestedDate = parseDateParam(params?.date);

  const dayStart = new Date(requestedDate);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(dayStart.getDate() + 1);

  const { data: logs, error } = await supabase
    .from("food_logs")
    .select("*")
    .eq("user_id", user.id) // Use user.id
    .gte("consumed_at", dayStart.toISOString())
    .lt("consumed_at", nextDay.toISOString())
    .order("consumed_at", { ascending: false });

  if (error) {
    console.warn("Unable to load daily logs", error);
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", user.id) // Use user.id
    .maybeSingle();

  if (!profile || profile.daily_calorie_target === null || profile.daily_calorie_target === 0) {
    redirect("/onboarding");
  }

  const { data: templates } = await supabase
    .from("meal_templates")
    .select(
      "id, name, created_at, meal_template_items (id, usda_id, grams, usda_library (description))",
    )
    .eq("user_id", user.id) // Use user.id
    .order("created_at", { ascending: false })
    .limit(20);

  const resolvedTemplates: MealTemplate[] =
    templates?.map((template) => ({
      id: template.id,
      name: template.name,
      created_at: template.created_at,
      items:
        template.meal_template_items?.map((item) => ({
          id: item.id,
          usda_id: item.usda_id,
          grams: Number(item.grams),
          description: item.usda_library?.description ?? undefined,
        })) ?? [],
    })) ?? [];

  const { data: portionMemoryRaw } = await supabase
    .from("food_logs")
    .select("food_name, weight_g")
    .eq("user_id", user.id) // Use user.id
    .order("consumed_at", { ascending: false })
    .limit(500);

  const portionMemoryAggregated = (portionMemoryRaw ?? []).reduce((acc, row) => {
    const key = (row.food_name as string).toLowerCase();
    const existing = acc.get(key) ?? { total: 0, count: 0, label: row.food_name as string };
    acc.set(key, {
      total: existing.total + Number(row.weight_g ?? 0),
      count: existing.count + 1,
      label: existing.label,
    });
    return acc;
  }, new Map<string, { total: number; count: number; label: string }>());

  const portionMemory: PortionMemoryRow[] = Array.from(portionMemoryAggregated.values())
    .map((entry) => ({
      food_name: entry.label,
      weight_g: entry.count ? entry.total / entry.count : 0,
      count: entry.count,
    }))
    .sort((a, b) => b.count - a.count);

  const { data: recentFoods } = await supabase
    .from("food_logs")
    .select(
      "food_name, calories, protein, carbs, fat, fiber, sugar, sodium, weight_g, consumed_at",
    )
    .eq("user_id", user.id) // Use user.id
    .order("consumed_at", { ascending: false })
    .limit(40);

  const { data: waterLogs } = await supabase
    .from("water_logs")
    .select("id, amount_ml, logged_at")
    .eq("user_id", user.id) // Use user.id
    .gte("logged_at", dayStart.toISOString())
    .lt("logged_at", nextDay.toISOString())
    .order("logged_at", { ascending: false });

  // --- ADDED: Weight Data Fetching ---
  const weightLogs = await getWeightHistory(5);
  // Default to 70kg (or null) if no history exists
  const latestWeight = weightLogs[0]?.weight_kg ?? 70;

  return (
    <main className="min-h-screen bg-black text-white">
      <HomeClient
        initialLogs={logs ?? []}
        initialSelectedDate={formatDateParam(dayStart)}
        initialProfile={profile as UserProfile | null}
        initialTemplates={resolvedTemplates}
        initialPortionMemories={portionMemory}
        initialRecentFoods={recentFoods ?? []}
        initialWaterLogs={waterLogs ?? []}
      />
      
      {/* --- ADDED: Weight Logger Component --- */}
      <div className="mx-auto max-w-md px-4 pb-24 -mt-20 relative z-10">
         <WeightLogger initialLogs={weightLogs} defaultWeight={latestWeight} />
      </div>
    </main>
  );
}