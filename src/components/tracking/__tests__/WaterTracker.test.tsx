import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { WaterTracker } from "../WaterTracker";
import type { UseWaterTrackingReturn } from "@/types/water";

describe("WaterTracker", () => {
  const mockProps: UseWaterTrackingReturn = {
    logs: [],
    waterAmount: 250,
    waterSaving: false,
    editingWaterId: null,
    editingWaterAmount: 0,
    deletingWaterId: null,
    addWater: vi.fn(),
    updateWater: vi.fn(),
    deleteWater: vi.fn(),
    startEditWater: vi.fn(),
    cancelEditWater: vi.fn(),
    setWaterAmount: vi.fn(),
  };

  it("should render empty state when no logs", () => {
    render(<WaterTracker {...mockProps} />);

    expect(screen.getByText(/No water logs yet/i)).toBeInTheDocument();
  });

  it("should display water logs", () => {
    const logs = [
      { id: "1", amount_ml: 250, logged_at: "2026-02-02T10:00:00Z" },
      { id: "2", amount_ml: 500, logged_at: "2026-02-02T11:00:00Z" },
    ];

    render(<WaterTracker {...mockProps} logs={logs} />);

    expect(screen.getByText("250 ml")).toBeInTheDocument();
    expect(screen.getByText("500 ml")).toBeInTheDocument();
  });

  it("should calculate total and progress correctly", () => {
    const logs = [
      { id: "1", amount_ml: 500, logged_at: "2026-02-02T10:00:00Z" },
      { id: "2", amount_ml: 500, logged_at: "2026-02-02T11:00:00Z" },
    ];

    render(<WaterTracker {...mockProps} logs={logs} waterGoal={2000} />);

    expect(screen.getByText(/Today's total: 1000 ml/i)).toBeInTheDocument();
    expect(screen.getByText("50% of goal")).toBeInTheDocument();
  });

  it("should call addWater when button clicked", () => {
    const addWater = vi.fn();

    render(<WaterTracker {...mockProps} addWater={addWater} waterAmount={500} />);

    fireEvent.click(screen.getByText("Add water"));

    expect(addWater).toHaveBeenCalledWith(500);
  });

  it("should call addWater with quick add amounts", () => {
    const addWater = vi.fn();

    render(<WaterTracker {...mockProps} addWater={addWater} />);

    fireEvent.click(screen.getByText("+250 ml"));
    expect(addWater).toHaveBeenCalledWith(250);

    fireEvent.click(screen.getByText("+500 ml"));
    expect(addWater).toHaveBeenCalledWith(500);
  });

  it("should show saving state", () => {
    render(<WaterTracker {...mockProps} waterSaving={true} />);

    expect(screen.getByText("Saving...")).toBeInTheDocument();
    expect(screen.getByText("Saving...")).toBeDisabled();
  });

  it("should limit displayed logs to 5", () => {
    const logs = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`,
      amount_ml: 250,
      logged_at: "2026-02-02T10:00:00Z",
    }));

    render(<WaterTracker {...mockProps} logs={logs} />);

    const logEntries = screen.getAllByText("250 ml");
    expect(logEntries).toHaveLength(5);
  });
});
