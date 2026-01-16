const requiredKeys = [
  "GEMINI_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

requiredKeys.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`❌ MISSING ENV VAR: ${key}`);
  }
});

export { requiredKeys };
