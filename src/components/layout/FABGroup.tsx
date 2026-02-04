import React from "react";

type Props = {
  onScanClick: () => void;
  onManualClick: () => void;
};

export function FABGroup({ onScanClick, onManualClick }: Props) {
  return (
    <div className="scanner-container right-4 flex flex-col gap-3">
      <button
        className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:bg-emerald-400"
        onClick={onScanClick}
        aria-label="Add Log"
      >
        <span className="text-2xl">+</span>
      </button>
      <button
        className="rounded-full bg-white/10 p-3 text-sm font-medium text-white backdrop-blur-md"
        onClick={onManualClick}
      >
        Manual Add
      </button>
    </div>
  );
}