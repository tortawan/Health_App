import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useManualFoodSearch } from "../useManualFoodSearch";
import * as supabaseBrowser from "@/lib/supabase-browser";
import toast from "react-hot-toast";

// Mock dependencies
vi.mock("@/lib/supabase-browser", () => ({
  createClient: vi.fn(),
}));
vi.mock("react-hot-toast");

describe("useManualFoodSearch", () => {
  const mockRpc = vi.fn();
  const mockSelect = vi.fn();
  const mockPortionMemories = [
    { id: 1, food_name: "Banana", last_weight_g: 120, usages: 5, user_id: "u1", created_at: "" }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (supabaseBrowser.createClient as any).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user1" } } }) },
      rpc: mockRpc,
    });
    global.fetch = vi.fn();
  });

  it("initializes with default state", () => {
    const { result } = renderHook(() => useManualFoodSearch({ portionMemories: [], onSelect: mockSelect }));
    expect(result.current.manualQuery).toBe("");
    expect(result.current.isSearching).toBe(false);
    expect(result.current.searchResults).toEqual([]);
  });

  it("updates query state", () => {
    const { result } = renderHook(() => useManualFoodSearch({ portionMemories: [], onSelect: mockSelect }));
    act(() => {
      result.current.setManualQuery("Apple");
    });
    expect(result.current.manualQuery).toBe("Apple");
  });

  it("runManualSearch calls Supabase RPC successfully", async () => {
    mockRpc.mockResolvedValue({ data: [{ description: "Apple", usda_id: 123 }], error: null });
    
    const { result } = renderHook(() => useManualFoodSearch({ portionMemories: [], onSelect: mockSelect }));
    
    act(() => {
      result.current.setManualQuery("Apple");
    });

    await act(async () => {
      await result.current.runManualSearch();
    });

    expect(mockRpc).toHaveBeenCalledWith("match_foods", expect.objectContaining({ query_text: "Apple" }));
    expect(result.current.searchResults).toHaveLength(1);
    expect(result.current.searchResults[0].description).toBe("Apple");
  });

  it("falls back to API if RPC fails", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "RPC Error" } });
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => [{ description: "Fallback Apple" }],
    });

    const { result } = renderHook(() => useManualFoodSearch({ portionMemories: [], onSelect: mockSelect }));
    
    act(() => {
      result.current.setManualQuery("Apple");
    });

    await act(async () => {
      await result.current.runManualSearch();
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining("/api/search"));
    expect(result.current.searchResults[0].description).toBe("Fallback Apple");
  });

  it("handles empty query gracefully", async () => {
    const { result } = renderHook(() => useManualFoodSearch({ portionMemories: [], onSelect: mockSelect }));
    await act(async () => {
      await result.current.runManualSearch();
    });
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("applyManualResult triggers onSelect with new item", () => {
    const { result } = renderHook(() => useManualFoodSearch({ portionMemories: [], onSelect: mockSelect }));
    const match = { description: "New Food", usda_id: 999 } as any;

    act(() => {
      result.current.applyManualResult(match);
    });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ food_name: "New Food", weight: 100 }),
      undefined
    );
  });

  it("applyManualResult triggers onSelect with replacement index", () => {
    const { result } = renderHook(() => useManualFoodSearch({ portionMemories: [], onSelect: mockSelect }));
    const match = { description: "Replacement Food", usda_id: 888 } as any;

    act(() => {
      result.current.setManualOpenIndex(2); // Set index being edited
    });

    act(() => {
      result.current.applyManualResult(match);
    });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ food_name: "Replacement Food" }),
      2
    );
  });

  it("applies portion memory weight if available", () => {
    const { result } = renderHook(() => useManualFoodSearch({ portionMemories: mockPortionMemories as any, onSelect: mockSelect }));
    const match = { description: "Banana", usda_id: 111 } as any;

    act(() => {
      result.current.applyManualResult(match);
    });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ food_name: "Banana", weight: 120 }), // 120 from memory
      undefined
    );
  });
});