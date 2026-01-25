// Precision Helper: Rounds to 2 decimal places to fix floating point errors
export const calc = (value: number | null | undefined, factor: number = 1) => {
  if (value === null || value === undefined) return null;
  return Math.round(value * factor * 100) / 100;
};

export function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as Record<string, unknown>).message === "string"
  );
}