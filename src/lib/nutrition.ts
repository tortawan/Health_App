export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type GoalType = "lose" | "maintain" | "gain";

export type MacroNutrients = {
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  fiber_100g?: number | null;
  sugar_100g?: number | null;
  sodium_100g?: number | null;
};

const activityMultipliers: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export function calculateTargets({
  height,
  weight,
  age,
  activityLevel,
  goalType,
}: {
  height: number;
  weight: number;
  age: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
}) {
  const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  const tdee = bmr * (activityMultipliers[activityLevel] ?? 1.2);
  let calorieTarget = tdee;

  if (goalType === "lose") calorieTarget = tdee * 0.85;
  if (goalType === "gain") calorieTarget = tdee * 1.1;

  const proteinTarget = weight * 1.6;

  return {
    daily_calorie_target: Math.round(calorieTarget),
    daily_protein_target: Math.round(proteinTarget),
  };
}

export function adjustedMacros(match: MacroNutrients | undefined, weight: number) {
  if (!match) return null;
  const factor = weight / 100;
  const calc = (value: number | null | undefined) =>
    value === null || value === undefined ? null : Number(value) * factor;

  return {
    calories: calc(match.kcal_100g),
    protein: calc(match.protein_100g),
    carbs: calc(match.carbs_100g),
    fat: calc(match.fat_100g),
  };
}
