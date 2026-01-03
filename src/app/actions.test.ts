import { describe, expect, it } from "vitest";
import { adjustedMacros, calculateTargets } from "@/lib/nutrition";

describe("calculateTargets", () => {
  it("applies Mifflin-St Jeor with goal modifiers", () => {
    const maintain = calculateTargets({
      height: 180,
      weight: 80,
      age: 30,
      activityLevel: "moderate",
      goalType: "maintain",
    });
    expect(maintain.daily_calorie_target).toBeGreaterThan(0);

    const deficit = calculateTargets({
      height: 180,
      weight: 80,
      age: 30,
      activityLevel: "moderate",
      goalType: "lose",
    });

    const surplus = calculateTargets({
      height: 180,
      weight: 80,
      age: 30,
      activityLevel: "moderate",
      goalType: "gain",
    });

    expect(deficit.daily_calorie_target).toBeLessThan(maintain.daily_calorie_target);
    expect(surplus.daily_calorie_target).toBeGreaterThan(maintain.daily_calorie_target);
    expect(maintain.daily_protein_target).toBe(Math.round(80 * 1.6));
  });
});

describe("adjustedMacros", () => {
  it("scales macro values based on weight", () => {
    const scaled = adjustedMacros(
      {
        kcal_100g: 200,
        protein_100g: 10,
        carbs_100g: 20,
        fat_100g: 5,
      },
      150,
    );

    expect(scaled).toEqual({
      calories: 300,
      protein: 15,
      carbs: 30,
      fat: 7.5,
    });
  });
});
