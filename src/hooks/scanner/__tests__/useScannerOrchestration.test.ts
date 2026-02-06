import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useScannerOrchestration } from "../useScannerOrchestration";
import * as useScannerModule from "@/hooks/scanner/useScanner";
import toast from "react-hot-toast";

// Mock dependencies
vi.mock("@/hooks/scanner/useScanner");
vi.mock("react-hot-toast");

describe("useScannerOrchestration", () => {
  const mockSetDraft = vi.fn();
  const mockSetError = vi.fn();
  const mockUpdateScannerView = vi.fn();
  const mockOnLogAdded = vi.fn();
  const mockOnRefreshRecent = vi.fn();
  const mockOnLogConfirmed = vi.fn();

  // Controlled draft state
  let draftState: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    draftState = [
      { id: "1", food_name: "Burger", weight: 200, match: { usda_id: 1 }, macro_overrides: {} }
    ];

    // Mock the inner useScanner hook
    (useScannerModule.useScanner as any).mockReturnValue({
      draft: draftState,
      setDraft: mockSetDraft.mockImplementation((cb: any) => {
        draftState = typeof cb === 'function' ? cb(draftState) : cb;
      }),
      imagePublicUrl: "http://fake.url/img.jpg",
      setError: mockSetError,
      updateScannerView: mockUpdateScannerView,
    });
    
    global.fetch = vi.fn();
  });

  it("handles macro updates correctly", () => {
    const { result } = renderHook(() => useScannerOrchestration({
      selectedDate: "2025-01-01",
      onLogAdded: mockOnLogAdded,
      onRefreshRecent: mockOnRefreshRecent
    }));

    act(() => {
      result.current.handleUpdateMacro(0, "protein", 50);
    });

    expect(mockSetDraft).toHaveBeenCalled();
    // In a real integration, the hook would re-render with updated draft from useScanner
    // Here we mainly verify the setter was called logic
  });

  it("handles confirm success", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: "log-123", food_name: "Burger" } }),
    });

    const { result } = renderHook(() => useScannerOrchestration({
      selectedDate: "2025-01-01",
      onLogAdded: mockOnLogAdded,
      onRefreshRecent: mockOnRefreshRecent,
      onLogConfirmed: mockOnLogConfirmed
    }));

    await act(async () => {
      await result.current.handleConfirm(0);
    });

    expect(global.fetch).toHaveBeenCalledWith("/api/log-food", expect.anything());
    expect(mockOnLogAdded).toHaveBeenCalled();
    expect(mockOnLogConfirmed).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Food log saved");
    expect(mockSetDraft).toHaveBeenCalled(); // Should remove item
  });

  it("handles confirm error", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Server error" }),
    });

    const { result } = renderHook(() => useScannerOrchestration({
      selectedDate: "2025-01-01",
      onLogAdded: mockOnLogAdded,
      onRefreshRecent: mockOnRefreshRecent
    }));

    await act(async () => {
      await result.current.handleConfirm(0);
    });

    expect(toast.error).toHaveBeenCalledWith("Server error");
    expect(mockOnLogAdded).not.toHaveBeenCalled();
  });

  it("passes through scanner props", () => {
    const { result } = renderHook(() => useScannerOrchestration({
      selectedDate: "2025-01-01",
      onLogAdded: mockOnLogAdded,
      onRefreshRecent: mockOnRefreshRecent
    }));

    expect(result.current.imagePublicUrl).toBe("http://fake.url/img.jpg");
  });
});