import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { FlagLogModal } from "../FlagLogModal";
import * as communityActions from "@/app/actions/community";
import toast from "react-hot-toast";

// Mock dependencies
vi.mock("@/app/actions/community", () => ({
  reportLogIssue: vi.fn(),
}));
vi.mock("react-hot-toast");

describe("FlagLogModal", () => {
  const mockClose = vi.fn();
  const mockLog = { id: "123", food_name: "Weird Pizza" } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = render(<FlagLogModal log={mockLog} isOpen={false} onClose={mockClose} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders correctly when open", () => {
    render(<FlagLogModal log={mockLog} isOpen={true} onClose={mockClose} />);
    expect(screen.getByText("Report an issue")).toBeInTheDocument();
    expect(screen.getByText("Weird Pizza")).toBeInTheDocument();
  });

  it("allows typing notes", () => {
    render(<FlagLogModal log={mockLog} isOpen={true} onClose={mockClose} />);
    const textarea = screen.getByPlaceholderText("Describe the issue...");
    fireEvent.change(textarea, { target: { value: "Nutrition is wrong" } });
    expect(textarea).toHaveValue("Nutrition is wrong");
  });

  it("submits report calls action", async () => {
    (communityActions.reportLogIssue as any).mockResolvedValue(true);
    
    render(<FlagLogModal log={mockLog} isOpen={true} onClose={mockClose} />);
    const textarea = screen.getByPlaceholderText("Describe the issue...");
    fireEvent.change(textarea, { target: { value: "Wrong cal" } });
    
    const submitBtn = screen.getByText("Submit report");
    fireEvent.click(submitBtn);

    expect(submitBtn).toBeDisabled(); // Loading state check
    expect(screen.getByText("Sending...")).toBeInTheDocument();

    await waitFor(() => {
      expect(communityActions.reportLogIssue).toHaveBeenCalledWith("123", { notes: "Wrong cal" });
      expect(toast.success).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });
  });

  it("handles submission errors", async () => {
    (communityActions.reportLogIssue as any).mockRejectedValue(new Error("Fail"));
    
    render(<FlagLogModal log={mockLog} isOpen={true} onClose={mockClose} />);
    fireEvent.click(screen.getByText("Submit report"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to submit report");
      expect(mockClose).not.toHaveBeenCalled(); // Should keep modal open on error
    });
  });
});