import { describe, it, expect, vi, beforeEach } from "vitest";
import { logFood } from "./food";

// Mocking external dependencies
const mockInsert = vi.fn().mockReturnThis();
const mockSelect = vi.fn().mockReturnThis();
const mockSingle = vi.fn(() => Promise.resolve({ 
    data: { id: "mock-log-id", calories: 100, protein: 10, carbs: 10, fat: 2 }, 
    error: null 
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseServerClient: vi.fn(() => Promise.resolve({
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "test-user-uuid" } } }),
    },
    from: vi.fn(() => ({
      insert: mockInsert,
      select: mockSelect,
      single: mockSingle,
    })),
  })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Food Actions Parity (Logic Check)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should calculate weight-adjusted macros correctly and pass to DB", async () => {
    const payload = {
      foodName: "Banana",
      weight: 200, // 2x the 100g base
      match: {
        description: "Banana, raw",
        kcal_100g: 89,
        protein_100g: 1.1,
        carbs_100g: 22.8,
        fat_100g: 0.3,
      },
    };

    await logFood(payload);

    // Verify the first argument of the insert call
    const insertedData = mockInsert.mock.calls[0][0];
    
    // 89 * 2 = 178
    expect(insertedData.calories).toBe(178);
    // 1.1 * 2 = 2.2
    expect(insertedData.protein).toBe(2.2);
    expect(insertedData.food_name).toBe("Banana");
    expect(insertedData.user_id).toBe("test-user-uuid");
  });

  it("should respect manual macro overrides", async () => {
    const payload = {
      foodName: "High Protein Shake",
      weight: 100,
      protein: 50, // Manual override
      match: {
        description: "Standard Shake",
        kcal_100g: 200,
        protein_100g: 20, 
        carbs_100g: 10,
        fat_100g: 5,
      },
    };

    await logFood(payload);
    const insertedData = mockInsert.mock.calls[0][0];
    
    expect(insertedData.protein).toBe(50);
    expect(insertedData.calories).toBe(200);
  });
});