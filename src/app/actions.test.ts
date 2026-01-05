import { beforeEach, describe, expect, it, vi } from "vitest";
import { logFood } from "./actions";
import { adjustedMacros, calculateTargets } from "@/lib/nutrition";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

let insertPayloads: any[] = [];

vi.mock("@/lib/supabase", () => {
  const supabaseMock = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-123" } } },
      })),
    },
    from: vi.fn(() => ({
      insert: (payload: any) => {
        insertPayloads.push(payload);
        return {
          select: () => ({
            single: async () => ({ data: payload, error: null }),
          }),
        };
      },
    })),
  };

  return {
    createSupabaseServerClient: vi.fn(async () => supabaseMock),
    createSupabaseServiceClient: vi.fn(() => null),
    supabaseServer: null,
    __esModule: true,
  };
});

beforeEach(() => {
  insertPayloads = [];
});

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

describe("logFood", () => {
  it("stores double the 100g macros when logging 200g", async () => {
    const result = await logFood({
      foodName: "Test Food",
      weight: 200,
      match: {
        kcal_100g: 120,
        protein_100g: 8,
        carbs_100g: 14,
        fat_100g: 5,
      },
    });

    const lastInsert = insertPayloads.at(-1);

    expect(lastInsert).toMatchObject({
      weight_g: 200,
      calories: 240,
      protein: 16,
      carbs: 28,
      fat: 10,
    });
    expect(result).toMatchObject({
      weight_g: 200,
      calories: 240,
      protein: 16,
      carbs: 28,
      fat: 10,
    });
  });
});
