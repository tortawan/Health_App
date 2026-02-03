// src/types/water.ts
export interface WaterLog {
  id: string;
  amount_ml: number;
  logged_at: string;
  isOptimistic?: boolean;
}

export interface WaterTrackingState {
  logs: WaterLog[];
  waterAmount: number;
  waterSaving: boolean;
  editingWaterId: string | null;
  editingWaterAmount: number;
  deletingWaterId: string | null;
}

export interface WaterTrackingActions {
  addWater: (amount: number) => Promise<void>;
  updateWater: (id: string, amount: number) => Promise<void>;
  deleteWater: (id: string) => Promise<void>;
  startEditWater: (log: WaterLog) => void;
  cancelEditWater: () => void;
  setWaterAmount: (amount: number) => void;
}

export type UseWaterTrackingReturn = WaterTrackingState & WaterTrackingActions;
