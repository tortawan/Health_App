// src/components/templates/TemplateList.tsx
"use client";

import React from "react";
import type { MealTemplate } from "@/types/template";

interface TemplateListProps {
  templates: MealTemplate[];
  onUse: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateList({ templates, onUse, onDelete }: TemplateListProps) {
  if (templates.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-slate-900/50 p-4 text-sm text-white/60">
        No templates yet. Save one from a draft or today&apos;s logs.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {templates.map((template) => (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
          key={template.id}
        >
          <div>
            <p className="text-sm font-semibold text-white">{template.name}</p>
            <p className="text-xs text-white/60">
              {template.items.length} item{template.items.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn"
              onClick={() => onUse(template.id)}
              type="button"
            >
              Use
            </button>
            <button
              className="btn bg-white/10 text-white hover:bg-white/20"
              onClick={() => onDelete(template.id)}
              type="button"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
