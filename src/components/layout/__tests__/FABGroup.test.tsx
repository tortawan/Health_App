import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { FABGroup } from "../FABGroup";

describe("FABGroup", () => {
  const mockScanClick = vi.fn();
  const mockManualClick = vi.fn();

  it("renders both buttons", () => {
    render(<FABGroup onScanClick={mockScanClick} onManualClick={mockManualClick} />);
    expect(screen.getByLabelText("Add Log")).toBeInTheDocument();
    expect(screen.getByText("Manual Add")).toBeInTheDocument();
  });

  it("triggers scan click handler", () => {
    render(<FABGroup onScanClick={mockScanClick} onManualClick={mockManualClick} />);
    const scanBtn = screen.getByLabelText("Add Log");
    fireEvent.click(scanBtn);
    expect(mockScanClick).toHaveBeenCalledTimes(1);
  });

  it("triggers manual click handler", () => {
    render(<FABGroup onScanClick={mockScanClick} onManualClick={mockManualClick} />);
    const manualBtn = screen.getByText("Manual Add");
    fireEvent.click(manualBtn);
    expect(mockManualClick).toHaveBeenCalledTimes(1);
  });
});