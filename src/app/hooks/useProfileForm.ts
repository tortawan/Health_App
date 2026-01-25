import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { calculateTargets, type ActivityLevel, type GoalType } from "@/lib/nutrition";
import type { UserProfile } from "@/types/food";
// FIX: Import from specific 'user' action file
import { upsertUserProfile } from "../actions/user";

export type ProfileFormState = {
  height: number;
  weight: number;
  age: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
  macroSplit: Record<string, number>;
};

const defaultMacroSplit = {
  protein: 30,
  carbs: 40,
  fat: 30,
};

export function buildProfileFormState(profile: UserProfile): ProfileFormState {
  return {
    height: profile?.height ?? 170,
    weight: profile?.weight ?? 70,
    age: profile?.age ?? 30,
    activityLevel: (profile?.activity_level as ActivityLevel | undefined) ?? "light",
    goalType: (profile?.goal_type as GoalType | undefined) ?? "maintain",
    macroSplit: (profile?.macro_split as Record<string, number> | null) ?? defaultMacroSplit,
  };
}

export function useProfileForm(
  profile: UserProfile,
  onError?: (message: string) => void,
) {
  const [profileForm, setProfileForm] = useState<ProfileFormState>(
    buildProfileFormState(profile),
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const router = useRouter();

  const targets = useMemo(
    () =>
      calculateTargets({
        height: profileForm.height,
        weight: profileForm.weight,
        age: profileForm.age,
        activityLevel: profileForm.activityLevel,
        goalType: profileForm.goalType,
      }),
    [profileForm.activityLevel, profileForm.age, profileForm.goalType, profileForm.height, profileForm.weight],
  );

  const saveProfile = useCallback(async () => {
    setSavingProfile(true);
    try {
      await upsertUserProfile({
        height: profileForm.height,
        weight: profileForm.weight,
        age: profileForm.age,
        activityLevel: profileForm.activityLevel,
        goalType: profileForm.goalType,
        macroSplit: profileForm.macroSplit,
      });
      toast.success("Goals updated");
      router.refresh();
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Unable to save profile.";
      onError?.(message);
      toast.error("Unable to save profile");
    } finally {
      setSavingProfile(false);
    }
  }, [profileForm, router, onError]);

  return {
    profileForm,
    setProfileForm,
    saveProfile,
    savingProfile,
    targets,
  };
}