import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useTemplateManagement } from "../useTemplateManagement";
import * as templateActions from "@/app/actions/templates";
import toast from "react-hot-toast";

// Mock dependencies
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/app/actions/templates", () => ({
  saveMealTemplate: vi.fn(),
  saveMealTemplateFromLogs: vi.fn(),
  applyMealTemplate: vi.fn(),
  deleteMealTemplate: vi.fn(),
}));

describe("useTemplateManagement", () => {
  const initialTemplates = [
    { id: "1", name: "Breakfast", items: [], created_at: "", user_id: "" }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("initializes with provided templates", () => {
      const { result } = renderHook(() => useTemplateManagement(initialTemplates));
      expect(result.current.templateList).toEqual(initialTemplates);
      expect(result.current.isTemplateManagerOpen).toBe(false);
    });

    it("updates templateList when prop changes", () => {
      const { result, rerender } = renderHook(
        ({ templates }) => useTemplateManagement(templates),
        { initialProps: { templates: initialTemplates } }
      );

      const newTemplates = [...initialTemplates, { id: "2", name: "Lunch", items: [], created_at: "", user_id: "" }];
      rerender({ templates: newTemplates });

      expect(result.current.templateList).toEqual(newTemplates);
    });
  });

  describe("saveTemplate", () => {
    it("saves a template successfully", async () => {
      const newTemplate = { id: "2", name: "New Meal", items: [], created_at: "", user_id: "" };
      (templateActions.saveMealTemplate as any).mockResolvedValue(newTemplate);

      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      await act(async () => {
        await result.current.saveTemplate("New Meal", [{ food_name: "Apple", weight_g: 100 } as any]);
      });

      expect(templateActions.saveMealTemplate).toHaveBeenCalledWith("New Meal", expect.anything());
      expect(result.current.templateList).toHaveLength(2);
      expect(result.current.templateList[0]).toEqual(newTemplate); // Newest first
      expect(toast.success).toHaveBeenCalledWith("Template saved.");
    });

    it("validates empty name", async () => {
      const { result } = renderHook(() => useTemplateManagement(initialTemplates));
      await act(async () => {
        await result.current.saveTemplate("", []);
      });
      expect(toast.error).toHaveBeenCalledWith("Enter a template name.");
      expect(templateActions.saveMealTemplate).not.toHaveBeenCalled();
    });

    it("validates empty items", async () => {
      const { result } = renderHook(() => useTemplateManagement(initialTemplates));
      await act(async () => {
        await result.current.saveTemplate("My Template", []);
      });
      expect(toast.error).toHaveBeenCalledWith("Template must have at least one item.");
    });
  });

  describe("saveTemplateFromLogs", () => {
    it("creates template from logs successfully", async () => {
      const newTemplate = { id: "3", name: "Log Meal", items: [], created_at: "", user_id: "" };
      (templateActions.saveMealTemplateFromLogs as any).mockResolvedValue(newTemplate);

      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      await act(async () => {
        await result.current.saveTemplateFromLogs("Log Meal", [{ food_name: "Apple", weight_g: 100 }]);
      });

      expect(templateActions.saveMealTemplateFromLogs).toHaveBeenCalled();
      expect(result.current.templateList).toContainEqual(newTemplate);
      expect(toast.success).toHaveBeenCalled();
    });

    it("validates empty name", async () => {
      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      await act(async () => {
        await result.current.saveTemplateFromLogs("", [{ food_name: "Apple", weight_g: 100 }]);
      });

      expect(toast.error).toHaveBeenCalledWith("Enter a template name.");
      expect(templateActions.saveMealTemplateFromLogs).not.toHaveBeenCalled();
    });

    it("validates empty logs", async () => {
      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      await act(async () => {
        await result.current.saveTemplateFromLogs("Log Meal", []);
      });

      expect(toast.error).toHaveBeenCalledWith("No logs available to save.");
      expect(templateActions.saveMealTemplateFromLogs).not.toHaveBeenCalled();
    });
  });

  describe("applyTemplate", () => {
    it("applies template successfully", async () => {
      (templateActions.applyMealTemplate as any).mockResolvedValue([]);

      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      await act(async () => {
        await result.current.applyTemplate("1", 1.5);
      });

      expect(templateActions.applyMealTemplate).toHaveBeenCalledWith("1", 1.5);
      expect(toast.success).toHaveBeenCalledWith("Template applied.");
    });

    it("handles apply error", async () => {
      (templateActions.applyMealTemplate as any).mockRejectedValue(new Error("Fail"));

      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      await expect(
        act(async () => {
          await result.current.applyTemplate("1", 1);
        })
      ).rejects.toThrow("Fail");
      
      expect(toast.error).toHaveBeenCalledWith("Fail");
    });
  });

  describe("deleteTemplate", () => {
    it("deletes template successfully", async () => {
      (templateActions.deleteMealTemplate as any).mockResolvedValue(undefined);

      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      await act(async () => {
        await result.current.deleteTemplate("1");
      });

      expect(templateActions.deleteMealTemplate).toHaveBeenCalledWith("1");
      expect(result.current.templateList).toHaveLength(0);
      expect(toast.success).toHaveBeenCalledWith("Template deleted.");
    });

    it("handles delete error", async () => {
      (templateActions.deleteMealTemplate as any).mockRejectedValue(new Error("Delete failed"));

      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      await act(async () => {
        await result.current.deleteTemplate("1");
      });

      expect(toast.error).toHaveBeenCalledWith("Delete failed");
      // Should still have 1 item because deletion failed
      expect(result.current.templateList).toHaveLength(1);
    });
  });

  describe("template selection", () => {
    it("exposes setters for selection", () => {
      const { result } = renderHook(() => useTemplateManagement(initialTemplates));

      act(() => {
        result.current.setSelectedTemplateId("1");
        result.current.setTemplateScale(2);
      });

      expect(result.current.selectedTemplateId).toBe("1");
      expect(result.current.templateScale).toBe(2);
    });
  });
});