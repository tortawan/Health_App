import React, { useState } from "react";
import toast from "react-hot-toast";
import { reportLogIssue } from "@/app/actions/community";
import type { FoodLogRecord } from "@/types/food";

type Props = {
  log: FoodLogRecord | null;
  isOpen: boolean;
  onClose: () => void;
};

export function FlagLogModal({ log, isOpen, onClose }: Props) {
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !log) return null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await reportLogIssue(log.id, { notes });
      toast.success("Report submitted. Thank you!");
      setNotes("");
      onClose();
    } catch (err) {
      console.error(err);
      toast.error("Failed to submit report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-[#1a1a1a] p-6 ring-1 ring-white/10">
        <h3 className="mb-4 text-lg font-bold text-white">Report an issue</h3>
        <p className="mb-4 text-sm text-white/60">
          Is the nutrition info for <span className="text-white">{log.food_name}</span> incorrect?
        </p>
        <div className="space-y-4">
          <label className="space-y-1 text-sm text-white/70 sm:col-span-2">
            <span>Notes</span>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Describe the issue..."
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            className="btn"
            disabled={isSubmitting}
            onClick={handleSubmit}
            type="button"
          >
            {isSubmitting ? "Sending..." : "Submit report"}
          </button>
          <button
            className="btn bg-white/10 text-white hover:bg-white/20"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}