import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TemplateList } from "../TemplateList";

describe("TemplateList", () => {
  it("renders empty state when no templates", () => {
    render(
      <TemplateList templates={[]} onUse={vi.fn()} onDelete={vi.fn()} />
    );
    // FIX: Match the actual text rendered by the component
    expect(screen.getByText(/No templates yet/i)).toBeInTheDocument();
  });

  it("calls onUse when use button clicked", () => {
    const onUse = vi.fn();
    const templates = [
      { id: "1", name: "Breakfast", items: [], created_at: "", user_id: "" }
    ];

    render(
      <TemplateList
        templates={templates}
        onUse={onUse}
        onDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Use"));
    expect(onUse).toHaveBeenCalledWith("1");
  });

  it("calls onDelete when delete button clicked", () => {
    const onDelete = vi.fn();
    const templates = [
      { id: "1", name: "Breakfast", items: [], created_at: "", user_id: "" }
    ];

    render(
      <TemplateList
        templates={templates}
        onUse={vi.fn()}
        onDelete={onDelete}
      />
    );

    // Find the delete button (trash icon or label)
    const deleteBtn = screen.getByRole("button", { name: /delete/i }); 
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("1");
  });
});