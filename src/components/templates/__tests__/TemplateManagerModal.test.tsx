// src/components/templates/__tests__/TemplateManagerModal.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateManagerModal } from "../TemplateManagerModal";
import type { UseTemplateManagementReturn } from "@/types/template";

describe("TemplateManagerModal", () => {
  const mockProps: UseTemplateManagementReturn & { dailyLogs: any[] } = {
    isTemplateManagerOpen: true,
    templateList: [],
    selectedTemplateId: null,
    templateScale: 1,
    isSavingTemplate: false,
    isSavingFromLogs: false,
    isApplyingTemplate: false,
    templateName: "",
    templateFromLogsName: "",
    saveTemplate: jest.fn(),
    saveTemplateFromLogs: jest.fn(),
    applyTemplate: jest.fn(),
    deleteTemplate: jest.fn(),
    setSelectedTemplateId: jest.fn(),
    setTemplateScale: jest.fn(),
    setIsTemplateManagerOpen: jest.fn(),
    setTemplateName: jest.fn(),
    setTemplateFromLogsName: jest.fn(),
    dailyLogs: [],
  };

  it("should not render when closed", () => {
    render(
      <TemplateManagerModal {...mockProps} isTemplateManagerOpen={false} />
    );

    expect(screen.queryByText("Meal templates")).not.toBeInTheDocument();
  });

  it("should render when open", () => {
    render(<TemplateManagerModal {...mockProps} />);

    expect(screen.getByText("Meal templates")).toBeInTheDocument();
    expect(screen.getByText("Manage your favorites")).toBeInTheDocument();
  });

  it("should close when X button clicked", () => {
    render(<TemplateManagerModal {...mockProps} />);

    fireEvent.click(screen.getByText("✕"));

    expect(mockProps.setIsTemplateManagerOpen).toHaveBeenCalledWith(false);
  });

  it("should display empty state when no templates", () => {
    render(<TemplateManagerModal {...mockProps} />);

    expect(
      screen.getByText(/No templates yet/i)
    ).toBeInTheDocument();
  });

  it("should display template list", () => {
    const templates = [
      {
        id: "1",
        name: "Breakfast",
        items: [{ usda_id: 123, grams: 100 }],
        created_at: "2026-02-02",
        user_id: "user-1",
      },
    ];

    render(<TemplateManagerModal {...mockProps} templateList={templates} />);

    expect(screen.getByText("Breakfast")).toBeInTheDocument();
    expect(screen.getByText("1 item")).toBeInTheDocument();
  });

  it("should call saveTemplateFromLogs with filtered logs", () => {
    const dailyLogs = [
      { food_name: "Apple", weight_g: 100 },
      { food_name: "Invalid", weight_g: 0 }, // Should be filtered
    ];

    render(
      <TemplateManagerModal
        {...mockProps}
        dailyLogs={dailyLogs}
        templateFromLogsName="My Template"
      />
    );

    fireEvent.click(screen.getByText("Save"));

    expect(mockProps.saveTemplateFromLogs).toHaveBeenCalledWith(
      "My Template",
      [{ food_name: "Apple", weight_g: 100 }]
    );
  });

  it("should use template and close modal", () => {
    const templates = [
      {
        id: "template-1",
        name: "Breakfast",
        items: [],
        created_at: "2026-02-02",
        user_id: "user-1",
      },
    ];

    render(<TemplateManagerModal {...mockProps} templateList={templates} />);

    fireEvent.click(screen.getByText("Use"));

    expect(mockProps.setSelectedTemplateId).toHaveBeenCalledWith("template-1");
    expect(mockProps.setIsTemplateManagerOpen).toHaveBeenCalledWith(false);
  });
});
