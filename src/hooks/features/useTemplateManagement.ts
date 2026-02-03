// src/hooks/features/useTemplateManagement.ts
"use client";

import { useState, useCallback, useEffect } from "react";
import toast from "react-hot-toast";
import {
  saveMealTemplate,
  saveMealTemplateFromLogs,
  applyMealTemplate,
  deleteMealTemplate,
} from "@/app/actions/templates";
import type { 
  MealTemplate, 
  MealTemplateItem,
  UseTemplateManagementReturn 
} from "@/types/template";

export function useTemplateManagement(
  initialTemplates: MealTemplate[]
): UseTemplateManagementReturn {
  const [templateList, setTemplateList] = useState<MealTemplate[]>(initialTemplates);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templateScale, setTemplateScale] = useState(1);
  const [isTemplateManagerOpen, setIsTemplateManagerOpen] = useState(false);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isSavingFromLogs, setIsSavingFromLogs] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateFromLogsName, setTemplateFromLogsName] = useState("");

  // Sync with prop changes
  useEffect(() => {
    setTemplateList(initialTemplates);
  }, [initialTemplates]);

  const saveTemplate = useCallback(
    async (name: string, items: MealTemplateItem[]) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        toast.error("Enter a template name.");
        return;
      }

      if (items.length === 0) {
        toast.error("Template must have at least one item.");
        return;
      }

      setIsSavingTemplate(true);
      try {
        const saved = await saveMealTemplate(trimmedName, items);
        setTemplateList((prev) => [saved, ...prev]);
        setTemplateName("");
        toast.success("Template saved.");
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Unable to save template.");
      } finally {
        setIsSavingTemplate(false);
      }
    },
    []
  );

  const saveTemplateFromLogs = useCallback(
    async (name: string, logItems: Array<{ food_name: string; weight_g: number }>) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        toast.error("Enter a template name.");
        return;
      }

      if (logItems.length === 0) {
        toast.error("No logs available to save.");
        return;
      }

      setIsSavingFromLogs(true);
      try {
        const saved = await saveMealTemplateFromLogs(trimmedName, logItems);
        setTemplateList((prev) => [saved, ...prev]);
        setTemplateFromLogsName("");
        toast.success("Template created from today's logs.");
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Unable to save template.");
      } finally {
        setIsSavingFromLogs(false);
      }
    },
    []
  );

  const applyTemplate = useCallback(
    async (id: string, scale: number) => {
      setIsApplyingTemplate(true);
      try {
        const inserted = await applyMealTemplate(id, scale);
        toast.success("Template applied.");
        setSelectedTemplateId(null);
        setTemplateScale(1);
        return inserted;
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Unable to apply template.");
        throw err;
      } finally {
        setIsApplyingTemplate(false);
      }
    },
    []
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      try {
        await deleteMealTemplate(id);
        setTemplateList((prev) => prev.filter((template) => template.id !== id));
        
        if (selectedTemplateId === id) {
          setSelectedTemplateId(null);
        }
        
        toast.success("Template deleted.");
      } catch (err) {
        console.error(err);
        toast.error(err instanceof Error ? err.message : "Unable to delete template.");
      }
    },
    [selectedTemplateId]
  );

  return {
    templateList,
    selectedTemplateId,
    templateScale,
    isTemplateManagerOpen,
    isSavingTemplate,
    isSavingFromLogs,
    isApplyingTemplate,
    templateName,
    templateFromLogsName,
    saveTemplate,
    saveTemplateFromLogs,
    applyTemplate,
    deleteTemplate,
    setSelectedTemplateId,
    setTemplateScale,
    setIsTemplateManagerOpen,
    setTemplateName,
    setTemplateFromLogsName,
  };
}
