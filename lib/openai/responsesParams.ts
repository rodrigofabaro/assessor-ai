export function supportsResponsesTemperature(model: string | null | undefined): boolean {
  const normalized = String(model || "").trim().toLowerCase();
  if (!normalized) return true;
  // GPT-5 Responses currently rejects the temperature parameter.
  return !normalized.startsWith("gpt-5");
}

export function buildResponsesTemperatureParam(
  model: string | null | undefined,
  temperature: number
): Record<string, number> {
  return supportsResponsesTemperature(model) ? { temperature } : {};
}
