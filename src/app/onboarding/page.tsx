import { redirect } from "next/navigation";
import { OnboardingClient } from "./onboarding-client";
import { type ActivityLevel, type GoalType } from "@/lib/nutrition";
import { createSupabaseServerClient } from "@/lib/supabase";

export default async function OnboardingPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (profile?.daily_calorie_target) {
    redirect("/");
  }

  const defaults = {
    height: profile?.height ?? 170,
    weight: profile?.weight ?? 70,
    age: profile?.age ?? 30,
    activityLevel: (profile?.activity_level as string | null) ?? "light",
    goalType: (profile?.goal_type as string | null) ?? "maintain",
  };

  return (
    <div className="space-y-6">
      <OnboardingClient
        defaults={{
          height: Number(defaults.height),
          weight: Number(defaults.weight),
          age: Number(defaults.age),
          activityLevel: defaults.activityLevel as ActivityLevel,
          goalType: defaults.goalType as GoalType,
        }}
      />
    </div>
  );
}
