import { GoogleGenerativeAI } from "@google/generative-ai";

const geminiApiKey = process.env.GEMINI_API_KEY;

if (!geminiApiKey) {
  console.warn("GEMINI_API_KEY is not set. /api/analyze will return a mock.");
}

export const geminiClient = geminiApiKey
  ? new GoogleGenerativeAI(geminiApiKey)
  : null;

export const MODEL_NAME = "gemini-2.5-flash";

export const FOOD_PROMPT = `
Identify all distinct food items in this image.
Return a JSON array named "items" where each object has:
- food_name: concise label (e.g., "grilled chicken breast")
- search_term: text optimized for USDA search (e.g., "grilled chicken breast")
- quantity_estimate: visual estimate, include grams when possible (e.g., "medium portion, ~150g")
Do not return nutrition values. Respond with JSON only.
`;
