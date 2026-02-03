// src/components/templates/__tests__/TemplateList.test.tsx
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { TemplateList } from "../TemplateList";

describe("TemplateList", () => {
  it("renders empty state when no templates", () => {
    render(
      <TemplateList templates={[]} onUse={jest.fn()} onDelete={jest.fn()} />
    );

    expect(
      screen.getByText(/No templates yet/i)
    ).toBeInTheDocument();
  });

  it("calls onUse when use button clicked", () => {
    const onUse = jest.fn();
    render(
      <TemplateList
        templates={[
          {
            id: "template-1",
            name: "Breakfast",
            items: [{ usda_id: 123, grams: 100 }],
            created_at: "2026-02-02",
            user_id: "user-1",
          },
        ]}
        onUse={onUse}
        onDelete={jest.fn()}
      />
    );

    fireEvent.click(screen.getByText("Use"));

    expect(onUse).toHaveBeenCalledWith("template-1");
  });

  it("calls onDelete when delete button clicked", () => {
    const onDelete = jest.fn();
    render(
      <TemplateList
        templates={[
          {
            id: "template-2",
            name: "Lunch",
            items: [],
            created_at: "2026-02-02",
            user_id: "user-1",
          },
        ]}
        onUse={jest.fn()}
        onDelete={onDelete}
      />
    );

    fireEvent.click(screen.getByText("Delete"));

    expect(onDelete).toHaveBeenCalledWith("template-2");
  });
});
