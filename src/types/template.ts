// src/types/template.ts
export interface MealTemplateItem {
  usda_id: number;
  grams: number;
}

export interface MealTemplate {
  id: string;
  name: string;
  items: MealTemplateItem[];
  created_at: string;
  user_id: string;
}

export interface TemplateManagementState {
  templateList: MealTemplate[];
  selectedTemplateId: string | null;
  templateScale: number;
  isTemplateManagerOpen: boolean;
  isSavingTemplate: boolean;
  isSavingFromLogs: boolean;
  isApplyingTemplate: boolean;
  templateName: string;
  templateFromLogsName: string;
}

export interface TemplateManagementActions {
  saveTemplate: (name: string, items: MealTemplateItem[]) => Promise<void>;
  saveTemplateFromLogs: (name: string, logItems: Array<{ food_name: string; weight_g: number }>) => Promise<void>;
  applyTemplate: (id: string, scale: number) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  setSelectedTemplateId: (id: string | null) => void;
  setTemplateScale: (scale: number) => void;
  setIsTemplateManagerOpen: (open: boolean) => void;
  setTemplateName: (name: string) => void;
  setTemplateFromLogsName: (name: string) => void;
}

export type UseTemplateManagementReturn = TemplateManagementState & TemplateManagementActions;
