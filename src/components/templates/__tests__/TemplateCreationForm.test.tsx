import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TemplateCreationForm } from "../TemplateCreationForm";

describe("TemplateCreationForm", () => {
  it("renders with provided name and description", () => {
    render(
      <TemplateCreationForm
        templateName="Daily"
        isSaving={false}
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        description="Save today"
      />
    );
    expect(screen.getByDisplayValue("Daily")).toBeInTheDocument();
    expect(screen.getByText("Save today")).toBeInTheDocument();
  });

  it("calls onNameChange on input change", () => {
    const onNameChange = vi.fn();
    render(
      <TemplateCreationForm
        templateName=""
        isSaving={false}
        onNameChange={onNameChange}
        onSave={vi.fn()}
      />
    );

    // FIX: Match the actual placeholder "Template name" (lowercase 'n')
    fireEvent.change(screen.getByPlaceholderText("Template name"), {
      target: { value: "New Name" },
    });
    expect(onNameChange).toHaveBeenCalledWith("New Name");
  });

  it("shows saving state and disables button", () => {
    render(
      <TemplateCreationForm
        templateName="Daily"
        isSaving={true}
        onNameChange={vi.fn()}
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText("Saving...")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});