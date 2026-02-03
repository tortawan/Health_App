// src/components/templates/__tests__/TemplateCreationForm.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateCreationForm } from "../TemplateCreationForm";

describe("TemplateCreationForm", () => {
  it("renders with provided name and description", () => {
    render(
      <TemplateCreationForm
        templateName="Daily"
        isSaving={false}
        onNameChange={jest.fn()}
        onSave={jest.fn()}
        description="Save today"
      />
    );

    expect(screen.getByDisplayValue("Daily")).toBeInTheDocument();
    expect(screen.getByText("Save today")).toBeInTheDocument();
  });

  it("calls onNameChange on input change", () => {
    const onNameChange = jest.fn();
    render(
      <TemplateCreationForm
        templateName=""
        isSaving={false}
        onNameChange={onNameChange}
        onSave={jest.fn()}
        description="Save today"
      />
    );

    fireEvent.change(screen.getByPlaceholderText("Template name"), {
      target: { value: "New Template" },
    });

    expect(onNameChange).toHaveBeenCalledWith("New Template");
  });

  it("shows saving state and disables button", () => {
    render(
      <TemplateCreationForm
        templateName="Daily"
        isSaving
        onNameChange={jest.fn()}
        onSave={jest.fn()}
        description="Save today"
      />
    );

    const button = screen.getByRole("button", { name: "Saving..." });
    expect(button).toBeDisabled();
  });
});
