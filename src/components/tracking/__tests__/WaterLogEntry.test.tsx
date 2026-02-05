import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { WaterLogEntry } from "../WaterLogEntry";

describe("WaterLogEntry", () => {
  const baseLog = {
    id: "1",
    amount_ml: 250,
    logged_at: "2026-02-02T10:00:00Z",
  };

  it("renders log details when not editing", () => {
    render(
      <WaterLogEntry
        log={baseLog}
        isEditing={false}
        editAmount={250}
        isDeleting={false}
        onEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onAmountChange={vi.fn()}
      />
    );

    expect(screen.getByText("250 ml")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("renders edit mode and triggers callbacks", async () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const onAmountChange = vi.fn();
    const user = userEvent.setup();

    render(
      <WaterLogEntry
        log={baseLog}
        isEditing={true}
        editAmount={300}
        isDeleting={false}
        onEdit={vi.fn()}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={vi.fn()}
        onAmountChange={onAmountChange}
      />
    );

    const input = screen.getByRole("spinbutton");

    await user.clear(input);
    await user.type(input, "350");
    expect(onAmountChange).toHaveBeenCalledWith(350);

    await user.click(screen.getByText("Save"));
    expect(onSave).toHaveBeenCalledWith(300);

    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("shows deleting state", () => {
    render(
      <WaterLogEntry
        log={baseLog}
        isEditing={false}
        editAmount={250}
        isDeleting={true}
        onEdit={vi.fn()}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
        onAmountChange={vi.fn()}
      />
    );

    expect(screen.getByText("Deleting...")).toBeInTheDocument();
    expect(screen.getByText("Deleting...")).toBeDisabled();
  });
});
