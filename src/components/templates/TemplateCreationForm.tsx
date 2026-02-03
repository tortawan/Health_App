// src/components/templates/TemplateCreationForm.tsx
"use client";

import React from "react";

interface TemplateCreationFormProps {
  templateName: string;
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
  description: string;
}

export function TemplateCreationForm({
  templateName,
  isSaving,
  onNameChange,
  onSave,
  description,
}: TemplateCreationFormProps) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm font-medium text-white">Create from today&apos;s logs</p>
      <p className="text-xs text-white/60">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-emerald-400 focus:outline-none"
          placeholder="Template name"
          value={templateName}
          onChange={(e) => onNameChange(e.target.value)}
        />
        <button
          className="btn"
          disabled={isSaving}
          onClick={onSave}
          type="button"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
