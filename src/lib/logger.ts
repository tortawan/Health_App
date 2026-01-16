type GeminiLogStatus = "success" | "failure" | "fallback";

type GeminiLogPayload = {
  duration: number;
  status: GeminiLogStatus;
  reason?: string;
};

export function logGeminiRequest({ duration, status, reason }: GeminiLogPayload) {
  const payload = {
    event: "GEMINI_REQ",
    duration,
    status,
    ...(reason ? { reason } : {}),
  };

  console.log(JSON.stringify(payload));
}
