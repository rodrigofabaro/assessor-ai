export function splitLines(text: string) {
  return (text || "").replace(/\r/g, "").split("\n");
}
