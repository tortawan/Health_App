// src/hooks/features/__tests__/useTemplateManagement.test.ts
import { renderHook, act, waitFor } from "@testing-library/react";
import toast from "react-hot-toast";
import { useTemplateManagement } from "../useTemplateManagement";
import {
  saveMealTemplate,
  saveMealTemplateFromLogs,
  applyMealTemplate,
  deleteMealTemplate,
} from "@/app/actions/templates";

jest.mock("react-hot-toast");
jest.mock("@/app/actions/templates");

describe("useTemplateManagement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize with provided templates", () => {
      const initialTemplates = [
        { 
          id: "1", 
          name: "Breakfast", 
          items: [{ usda_id: 123, grams: 100 }],
          created_at: "2026-02-02",
          user_id: "user-1"
        },
      ];

      const { result } = renderHook(() =>
        useTemplateManagement(initialTemplates)
      );

      expect(result.current.templateList).toEqual(initialTemplates);
      expect(result.current.isTemplateManagerOpen).toBe(false);
    });
  });

  describe("saveTemplate", () => {
    it("should save template successfully", async () => {
      const savedTemplate = {
        id: "new-1",
        name: "Lunch",
        items: [{ usda_id: 456, grams: 200 }],
        created_at: "2026-02-02",
        user_id: "user-1",
      };

      (saveMealTemplate as jest.Mock).mockResolvedValue(savedTemplate);

      const { result } = renderHook(() => useTemplateManagement([]));

      await act(async () => {
        await result.current.saveTemplate("Lunch", [{ usda_id: 456, grams: 200 }]);
      });

      await waitFor(() => {
        expect(saveMealTemplate).toHaveBeenCalledWith("Lunch", [
          { usda_id: 456, grams: 200 },
        ]);
        expect(toast.success).toHaveBeenCalledWith("Template saved.");
        expect(result.current.templateList).toHaveLength(1);
        expect(result.current.templateName).toBe("");
      });
    });

    it("should validate template name", async () => {
      const { result } = renderHook(() => useTemplateManagement([]));

      await act(async () => {
        await result.current.saveTemplate("   ", [{ usda_id: 456, grams: 200 }]);
      });

      expect(toast.error).toHaveBeenCalledWith("Enter a template name.");
      expect(saveMealTemplate).not.toHaveBeenCalled();
    });

    it("should validate template has items", async () => {
      const { result } = renderHook(() => useTemplateManagement([]));

      await act(async () => {
        await result.current.saveTemplate("Lunch", []);
      });

      expect(toast.error).toHaveBeenCalledWith(
        "Template must have at least one item."
      );
      expect(saveMealTemplate).not.toHaveBeenCalled();
    });
  });

  describe("applyTemplate", () => {
    it("should apply template and reset state", async () => {
      const insertedLogs = [
        { id: "log-1", food_name: "Apple", weight_g: 100 },
      ];

      (applyMealTemplate as jest.Mock).mockResolvedValue(insertedLogs);

      const { result } = renderHook(() => useTemplateManagement([]));

      act(() => {
        result.current.setSelectedTemplateId("template-1");
        result.current.setTemplateScale(2);
      });

      await act(async () => {
        await result.current.applyTemplate("template-1", 2);
      });

      await waitFor(() => {
        expect(applyMealTemplate).toHaveBeenCalledWith("template-1", 2);
        expect(toast.success).toHaveBeenCalledWith("Template applied.");
        expect(result.current.selectedTemplateId).toBeNull();
        expect(result.current.templateScale).toBe(1);
      });
    });
  });

  describe("deleteTemplate", () => {
    it("should delete template from list", async () => {
      const initialTemplates = [
        { 
          id: "1", 
          name: "Breakfast", 
          items: [],
          created_at: "2026-02-02",
          user_id: "user-1"
        },
        { 
          id: "2", 
          name: "Lunch", 
          items: [],
          created_at: "2026-02-02",
          user_id: "user-1"
        },
      ];

      (deleteMealTemplate as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useTemplateManagement(initialTemplates)
      );

      await act(async () => {
        await result.current.deleteTemplate("1");
      });

      await waitFor(() => {
        expect(deleteMealTemplate).toHaveBeenCalledWith("1");
        expect(result.current.templateList).toHaveLength(1);
        expect(result.current.templateList[0].id).toBe("2");
      });
    });

    it("should clear selectedTemplateId if deleted template was selected", async () => {
      const initialTemplates = [
        { 
          id: "1", 
          name: "Breakfast", 
          items: [],
          created_at: "2026-02-02",
          user_id: "user-1"
        },
      ];

      (deleteMealTemplate as jest.Mock).mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useTemplateManagement(initialTemplates)
      );

      act(() => {
        result.current.setSelectedTemplateId("1");
      });

      await act(async () => {
        await result.current.deleteTemplate("1");
      });

      expect(result.current.selectedTemplateId).toBeNull();
    });
  });
});
