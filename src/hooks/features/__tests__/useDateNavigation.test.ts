import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useDateNavigation } from "../useDateNavigation";
import { useRouter, useSearchParams } from "next/navigation";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
  useSearchParams: vi.fn(),
}));

describe("useDateNavigation", () => {
  const mockPush = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
    (useRouter as any).mockReturnValue({ push: mockPush });
    (useSearchParams as any).mockReturnValue(new URLSearchParams());
  });

  it("initializes with the provided date", () => {
    const { result } = renderHook(() => useDateNavigation("2025-01-01"));
    expect(result.current.selectedDate).toBe("2025-01-01");
  });

  it("defaults to today if no date provided", () => {
    const today = new Date().toISOString().split("T")[0];
    // Pass undefined or null as initial date
    const { result } = renderHook(() => useDateNavigation(undefined as any));
    expect(result.current.selectedDate).toBe(today);
  });

  it("correctly identifies isToday", () => {
    const today = new Date().toISOString().split("T")[0];
    const { result } = renderHook(() => useDateNavigation(today));
    expect(result.current.isToday).toBe(true);

    const { result: pastResult } = renderHook(() => useDateNavigation("2020-01-01"));
    expect(pastResult.current.isToday).toBe(false);
  });

  it("setSelectedDate updates state and URL", () => {
    const { result } = renderHook(() => useDateNavigation("2025-01-01"));

    act(() => {
      result.current.setSelectedDate("2025-02-01");
    });

    expect(result.current.selectedDate).toBe("2025-02-01");
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("date=2025-02-01"));
  });

  it("handleShiftDate correctly shifts forward", () => {
    const { result } = renderHook(() => useDateNavigation("2025-01-01"));

    act(() => {
      result.current.handleShiftDate(1);
    });

    expect(result.current.selectedDate).toBe("2025-01-02");
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("date=2025-01-02"));
  });

  it("handleShiftDate correctly shifts backward", () => {
    const { result } = renderHook(() => useDateNavigation("2025-01-01"));

    act(() => {
      result.current.handleShiftDate(-1);
    });

    expect(result.current.selectedDate).toBe("2024-12-31");
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("date=2024-12-31"));
  });
});