export function parseAiJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?\s*|\s*```/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new Error("No JSON object found in AI response");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}
