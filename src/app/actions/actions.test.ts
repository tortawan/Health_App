import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as FoodActions from "./food";
import * as TrackingActions from "./tracking";
import * as UserActions from "./user";
import * as Utils from "./utils";

// --- Mocks ---

// 1. Mock Supabase Client
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockRpc = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();

// Chainable mock implementation
const mockQueryBuilder = {
  insert: mockInsert,
  select: mockSelect,
  update: mockUpdate,
  delete: mockDelete,
  eq: mockEq,
  single: mockSingle,
  order: mockOrder,
  limit: mockLimit,
  upsert: vi.fn(() => mockQueryBuilder),
  match_foods: mockRpc,
};

// Wire up the chain
mockInsert.mockReturnValue(mockQueryBuilder);
mockSelect.mockReturnValue(mockQueryBuilder);
mockUpdate.mockReturnValue(mockQueryBuilder);
mockDelete.mockReturnValue(mockQueryBuilder);
mockEq.mockReturnValue(mockQueryBuilder);
mockSingle.mockReturnValue(mockQueryBuilder);
mockOrder.mockReturnValue(mockQueryBuilder);
mockLimit.mockReturnValue(mockQueryBuilder);

const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("@/lib/supabase", () => ({
  createSupabaseServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
    from: vi.fn(() => mockQueryBuilder),
    rpc: mockRpc,
  })),
}));

// 2. Mock Navigation/Cache
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// 3. Mock Embedder
vi.mock("@/lib/embedder", () => ({
  getEmbedder: vi.fn(() => async () => ({ data: [0.1, 0.2, 0.3] })),
}));

// --- Tests ---

describe("Action Refactor Integrity Tests", () => {
  const MOCK_USER_ID = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    // Default happy path auth
    mockGetUser.mockResolvedValue({ data: { user: { id: MOCK_USER_ID, email: "test@example.com" } } });
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: MOCK_USER_ID, email: "test@example.com" } } } });
  });

  // --- 1. UTILS ---
  describe("utils.ts", () => {
    it("calc() handles floating point precision correctly", () => {
      // 0.1 + 0.2 = 0.30000000000000004 in JS
      expect(Utils.calc(0.1 + 0.2)).toBe(0.3);
      expect(Utils.calc(100, 0.33333)).toBe(33.33);
      expect(Utils.calc(null)).toBeNull();
    });

    it("isErrorWithMessage() identifies error objects", () => {
      expect(Utils.isErrorWithMessage({ message: "Fail" })).toBe(true);
      expect(Utils.isErrorWithMessage("Fail")).toBe(false);
      expect(Utils.isErrorWithMessage(new Error("Fail"))).toBe(true);
    });
  });

  // --- 2. FOOD ACTIONS ---
  describe("food.ts", () => {
    it("logFood() calculates macros and inserts correctly", async () => {
      mockSingle.mockResolvedValue({ data: { id: "log-1" }, error: null });

      const input = {
        foodName: "Banana",
        weight: 150,
        // FIX: Match the shape expected by adjustedMacros (from USDA library)
        match: {
          description: "Banana",
          kcal_100g: 89, 
          protein_100g: 1.1,
          carbs_100g: 22.8,
          fat_100g: 0.3,
        },
      };

      await FoodActions.logFood(input);

      // Verify calculation logic (1.5x the 100g value)
      const insertedCall = mockInsert.mock.calls[0][0];
      expect(insertedCall.food_name).toBe("Banana");
      expect(insertedCall.weight_g).toBe(150);
      expect(insertedCall.calories).toBe(133.5); // 89 * 1.5
      expect(insertedCall.user_id).toBe(MOCK_USER_ID);
    });

    it("logFood() throws on negative values", async () => {
      const input = {
        foodName: "Bad Food",
        calories: -100, // Invalid
      };

      await expect(FoodActions.logFood(input)).rejects.toThrow("must be a non-negative finite number");
    });

    it("updateFoodLog() scales macros when quantity changes", async () => {
      // FIX: Mock must provide ALL macro fields to prevent NaN in calculations
      mockSingle
        .mockResolvedValueOnce({ 
          data: { 
            id: "log-1", 
            quantity: 1, 
            serving_size: 1, 
            calories: 100, 
            protein: 10,
            carbs: 20, 
            fat: 5 
          }, 
          error: null 
        })
        .mockResolvedValueOnce({ data: { id: "log-1" }, error: null }); // For the update return

      await FoodActions.updateFoodLog("log-1", { quantity: 2 }); // Double the quantity

      const updateCall = mockUpdate.mock.calls[0][0];
      expect(updateCall.calories).toBe(200);
      expect(updateCall.protein).toBe(20);
      expect(updateCall.carbs).toBe(40);
    });

    it("manualSearch() handles empty queries", async () => {
      const result = await FoodActions.manualSearch("   ");
      expect(result).toEqual([]);
      expect(mockRpc).not.toHaveBeenCalled();
    });

    it("manualSearch() calls RPC with embeddings", async () => {
      mockRpc.mockResolvedValue({ data: [], error: null });
      await FoodActions.manualSearch("Chicken");
      expect(mockRpc).toHaveBeenCalledWith("match_foods", expect.objectContaining({
        query_text: "Chicken",
        match_count: 10
      }));
    });
  });

  // --- 3. TRACKING ACTIONS ---
  describe("tracking.ts", () => {
    it("logWeight() rejects invalid weight", async () => {
      await expect(TrackingActions.logWeight(-5)).rejects.toThrow("Weight must be greater than 0");
      await expect(TrackingActions.logWeight(0)).rejects.toThrow();
    });

    it("logWater() enforces auth", async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null } });
      await expect(TrackingActions.logWater(250)).rejects.toThrow("You must be signed in");
    });
  });

  // --- 4. USER ACTIONS ---
  describe("user.ts", () => {
    it("upsertUserProfile() calculates daily targets", async () => {
      mockSingle.mockResolvedValue({ data: {}, error: null });
      
      await UserActions.upsertUserProfile({
        height: 180,
        weight: 80,
        age: 30,
        activityLevel: "moderate",
        goalType: "maintain"
      });

      const upsertCall = mockQueryBuilder.upsert.mock.calls[0][0];
      // Basic check to ensure TDEE calc happened (Harris-Benedict approx ~2800 for these stats)
      expect(upsertCall.daily_calorie_target).toBeGreaterThan(2000);
      expect(upsertCall.daily_protein_target).toBeGreaterThan(50);
    });
  });

  // --- 5. ADMIN/SECURITY ---
  describe("Security Checks", () => {
    it("Blocks unauthenticated access globally", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      mockGetSession.mockResolvedValue({ data: { session: null } });

      await expect(FoodActions.getRecentFoods()).rejects.toThrow("You must be signed in");
      await expect(TrackingActions.deleteWaterLog("123")).rejects.toThrow("You must be signed in");
    });
  });
});