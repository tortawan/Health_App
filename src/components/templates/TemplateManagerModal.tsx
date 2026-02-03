// src/components/templates/TemplateManagerModal.tsx
"use client";

import React from "react";
import { TemplateList } from "./TemplateList";
import { TemplateCreationForm } from "./TemplateCreationForm";
import type { UseTemplateManagementReturn } from "@/types/template";

interface TemplateManagerModalProps extends UseTemplateManagementReturn {
  dailyLogs: Array<{ food_name: string; weight_g: number }>;
}

export function TemplateManagerModal({
  isTemplateManagerOpen,
  templateList,
  templateFromLogsName,
  isSavingFromLogs,
  setIsTemplateManagerOpen,
  setTemplateFromLogsName,
  saveTemplateFromLogs,
  setSelectedTemplateId,
  deleteTemplate,
  dailyLogs,
}: TemplateManagerModalProps) {
  if (!isTemplateManagerOpen) return null;

  const handleSaveFromLogs = () => {
    const logItems = dailyLogs
      .filter((log) => Number.isFinite(log.weight_g) && log.weight_g > 0)
      .map((log) => ({
        food_name: log.food_name,
        weight_g: log.weight_g,
      }));

    saveTemplateFromLogs(templateFromLogsName, logItems);
  };

  const handleUseTemplate = (id: string) => {
    setSelectedTemplateId(id);
    setIsTemplateManagerOpen(false);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm uppercase tracking-wide text-emerald-200">
              Meal templates
            </p>
            <h3 className="text-lg font-semibold text-white">
              Manage your favorites
            </h3>
          </div>
          <button
            className="text-white/70 hover:text-white"
            onClick={() => setIsTemplateManagerOpen(false)}
            type="button"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="mt-4 space-y-4">
          {/* Create from logs form */}
          <TemplateCreationForm
            templateName={templateFromLogsName}
            isSaving={isSavingFromLogs}
            onNameChange={setTemplateFromLogsName}
            onSave={handleSaveFromLogs}
            description="Save everything you logged today as a reusable meal template."
          />

          {/* Template list */}
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Saved templates
            </p>
            <TemplateList
              templates={templateList}
              onUse={handleUseTemplate}
              onDelete={deleteTemplate}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
