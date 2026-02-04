import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TemplateManagerModal } from "../TemplateManagerModal";

describe("TemplateManagerModal", () => {
  const defaultProps = {
    isTemplateManagerOpen: true,
    setIsTemplateManagerOpen: vi.fn(),
    templateList: [],
    selectedTemplateId: null,
    setSelectedTemplateId: vi.fn(),
    templateScale: 1,
    setTemplateScale: vi.fn(),
    templateName: "",
    setTemplateName: vi.fn(),
    isSavingTemplate: false,
    saveTemplate: vi.fn(),
    applyTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    // Additional props required by the component interface
    isApplyingTemplate: false, 
    dailyLogs: [],
    saveTemplateFromLogs: vi.fn(),
    templateFromLogsName: "",
    setTemplateFromLogsName: vi.fn(),
    isSavingTemplateFromLogs: false,
  };

  it("renders nothing when closed", () => {
    const { container } = render(
      <TemplateManagerModal {...defaultProps} isTemplateManagerOpen={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders content when open", () => {
    render(<TemplateManagerModal {...defaultProps} />);
    // FIX: Match the actual header text
    expect(screen.getByText("Manage your favorites")).toBeInTheDocument();
  });
});