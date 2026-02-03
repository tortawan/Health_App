import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { vi } from "vitest";
import { useWaterTracking } from "@/hooks/tracking/useWaterTracking";
import { WaterTracker } from "@/components/tracking/WaterTracker";
import { logWater } from "@/app/actions/tracking";

function WaterTrackerContainer({
  initialLogs,
  selectedDate,
}: {
  initialLogs: { id: string; amount_ml: number; logged_at: string }[];
  selectedDate: string;
}) {
  const tracking = useWaterTracking(initialLogs, selectedDate);
  return <WaterTracker {...tracking} />;
}

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

describe("WaterTracker Integration", () => {
  const mockRouter = { refresh: vi.fn(), push: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useRouter).mockReturnValue(mockRouter);
  });

  it("should complete full add water flow", async () => {
    vi.mocked(logWater).mockResolvedValue({
      id: "saved-1",
      amount_ml: 500,
      logged_at: "2026-02-02T10:00:00Z",
    });

    render(<WaterTrackerContainer initialLogs={[]} selectedDate="2026-02-02" />);

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "500" } });

    fireEvent.click(screen.getByText("Add water"));

    await waitFor(() => {
      expect(screen.queryByText("Saving...")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(logWater).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith("Water logged");
      expect(screen.getByText("500 ml")).toBeInTheDocument();
    });
  });

  it("should handle add water error gracefully", async () => {
    vi.mocked(logWater).mockRejectedValue(new Error("Network error"));

    render(<WaterTrackerContainer initialLogs={[]} selectedDate="2026-02-02" />);

    fireEvent.click(screen.getByText("+250 ml"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Network error");
      expect(screen.queryByText("250 ml")).not.toBeInTheDocument();
    });
  });
});
