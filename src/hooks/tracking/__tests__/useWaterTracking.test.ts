import { act, renderHook, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { logWater, updateWaterLog, deleteWaterLog } from "@/app/actions/tracking";
import { useWaterTracking } from "../useWaterTracking";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/app/actions/tracking", () => ({
  logWater: vi.fn(),
  updateWaterLog: vi.fn(),
  deleteWaterLog: vi.fn(),
}));

describe("useWaterTracking", () => {
  const mockRouter = { refresh: vi.fn(), push: vi.fn() };
  const selectedDate = "2026-02-02";
  // Stable empty array to prevent infinite loops in tests
  const EMPTY_LOGS: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    // Only fake 'Date' to fix timezone issues. 
    // We intentionally leave 'setTimeout'/'setInterval' as real so 'waitFor' doesn't time out.
    vi.useFakeTimers({ toFake: ['Date'] });
    
    // Set system time to noon UTC on the selected date to prevent timezone rollovers
    vi.setSystemTime(new Date("2026-02-02T12:00:00Z"));
    vi.mocked(useRouter).mockReturnValue(mockRouter);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Initialization", () => {
    it("should initialize with provided logs", () => {
      const initialLogs = [
        { id: "1", amount_ml: 250, logged_at: "2026-02-02T10:00:00Z" },
      ];

      const { result } = renderHook(() =>
        useWaterTracking(initialLogs, selectedDate)
      );

      expect(result.current.logs).toEqual(initialLogs);
      expect(result.current.waterAmount).toBe(250);
      expect(result.current.waterSaving).toBe(false);
    });

    it("should update logs when initialLogs prop changes", () => {
      const initialLogs = [
        { id: "1", amount_ml: 250, logged_at: "2026-02-02T10:00:00Z" },
      ];
      const { result, rerender } = renderHook(
        ({ logs }) => useWaterTracking(logs, selectedDate),
        { initialProps: { logs: initialLogs } }
      );

      const newLogs = [
        ...initialLogs,
        { id: "2", amount_ml: 500, logged_at: "2026-02-02T11:00:00Z" },
      ];

      rerender({ logs: newLogs });

      expect(result.current.logs).toEqual(newLogs);
    });
  });

  describe("addWater", () => {
    it("should add water with optimistic update", async () => {
      vi.mocked(logWater).mockResolvedValue({
        id: "real-id",
        amount_ml: 500,
        logged_at: "2026-02-02T10:00:00Z",
      });

      const { result } = renderHook(() => useWaterTracking(EMPTY_LOGS, selectedDate));

      await act(async () => {
        await result.current.addWater(500);
      });

      await waitFor(() => {
        expect(logWater).toHaveBeenCalledWith(
          500,
          expect.stringContaining("2026-02-02")
        );
        expect(toast.success).toHaveBeenCalledWith("Water logged");
        expect(mockRouter.refresh).toHaveBeenCalled();
        expect(result.current.logs).toHaveLength(1);
        expect(result.current.logs[0].id).toBe("real-id");
      });
    });

    it("should rollback on error", async () => {
      vi.mocked(logWater).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useWaterTracking(EMPTY_LOGS, selectedDate));

      await act(async () => {
        await result.current.addWater(500);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Network error");
        expect(result.current.logs).toHaveLength(0);
      });
    });

    it("should validate amount before adding", async () => {
      const { result } = renderHook(() => useWaterTracking(EMPTY_LOGS, selectedDate));

      await act(async () => {
        await result.current.addWater(-100);
      });

      expect(toast.error).toHaveBeenCalledWith("Enter a valid amount");
      expect(logWater).not.toHaveBeenCalled();
    });
  });

  describe("updateWater", () => {
    it("should update water log optimistically", async () => {
      const initialLogs = [
        { id: "1", amount_ml: 250, logged_at: "2026-02-02T10:00:00Z" },
      ];

      vi.mocked(updateWaterLog).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useWaterTracking(initialLogs, selectedDate)
      );

      await act(async () => {
        await result.current.updateWater("1", 500);
      });

      await waitFor(() => {
        expect(updateWaterLog).toHaveBeenCalledWith("1", 500);
        expect(toast.success).toHaveBeenCalledWith("Water updated");
        expect(result.current.logs[0].amount_ml).toBe(500);
      });
    });

    it("should rollback on update error", async () => {
      const initialLogs = [
        { id: "1", amount_ml: 250, logged_at: "2026-02-02T10:00:00Z" },
      ];

      vi.mocked(updateWaterLog).mockRejectedValue(new Error("Update failed"));

      const { result } = renderHook(() =>
        useWaterTracking(initialLogs, selectedDate)
      );

      await act(async () => {
        await result.current.updateWater("1", 500);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Update failed");
        expect(result.current.logs[0].amount_ml).toBe(250);
      });
    });

    it("should validate amount before updating", async () => {
      const initialLogs = [
        { id: "1", amount_ml: 250, logged_at: "2026-02-02T10:00:00Z" },
      ];

      const { result } = renderHook(() =>
        useWaterTracking(initialLogs, selectedDate)
      );

      await act(async () => {
        await result.current.updateWater("1", 0);
      });

      expect(toast.error).toHaveBeenCalledWith("Enter a valid amount");
      expect(updateWaterLog).not.toHaveBeenCalled();
    });
  });

  describe("deleteWater", () => {
    it("should delete water log optimistically", async () => {
      const initialLogs = [
        { id: "1", amount_ml: 250, logged_at: "2026-02-02T10:00:00Z" },
      ];

      vi.mocked(deleteWaterLog).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useWaterTracking(initialLogs, selectedDate)
      );

      await act(async () => {
        await result.current.deleteWater("1");
      });

      await waitFor(() => {
        expect(deleteWaterLog).toHaveBeenCalledWith("1");
        expect(toast.success).toHaveBeenCalledWith("Water deleted");
        expect(result.current.logs).toHaveLength(0);
      });
    });

    it("should rollback on delete error", async () => {
      const initialLogs = [
        { id: "1", amount_ml: 250, logged_at: "2026-02-02T10:00:00Z" },
      ];

      vi.mocked(deleteWaterLog).mockRejectedValue(new Error("Delete failed"));

      const { result } = renderHook(() =>
        useWaterTracking(initialLogs, selectedDate)
      );

      await act(async () => {
        await result.current.deleteWater("1");
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Delete failed");
        expect(result.current.logs).toHaveLength(1);
      });
    });
  });

  describe("Edit mode", () => {
    it("should enter edit mode", () => {
      const log = {
        id: "1",
        amount_ml: 250,
        logged_at: "2026-02-02T10:00:00Z",
      };
      const initialLogs = [log];
      const { result } = renderHook(() => useWaterTracking(initialLogs, selectedDate));

      act(() => {
        result.current.startEditWater(log);
      });

      expect(result.current.editingWaterId).toBe("1");
      expect(result.current.editingWaterAmount).toBe(250);
    });

    it("should cancel edit mode", () => {
      const log = {
        id: "1",
        amount_ml: 250,
        logged_at: "2026-02-02T10:00:00Z",
      };
      const initialLogs = [log];
      const { result } = renderHook(() => useWaterTracking(initialLogs, selectedDate));

      act(() => {
        result.current.startEditWater(log);
        result.current.cancelEditWater();
      });

      expect(result.current.editingWaterId).toBeNull();
      expect(result.current.editingWaterAmount).toBe(0);
    });
  });
});