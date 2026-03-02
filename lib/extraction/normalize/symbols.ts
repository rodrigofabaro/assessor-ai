type SymbolNormalizeOptions = {
  normalizeNewlines?: boolean;
  collapseWhitespace?: boolean;
};

function replaceOcrGlyphs(text: string) {
  return String(text || "")
    .replace(/[퐴퐵퐶퐷퐸퐹퐺퐻퐼퐽퐾퐿푀푁푂푃푄푅푆푇푈푉푊푋푌푍]/g, (ch) =>
      String.fromCharCode("A".charCodeAt(0) + "퐴퐵퐶퐷퐸퐹퐺퐻퐼퐽퐾퐿푀푁푂푃푄푅푆푇푈푉푊푋푌푍".indexOf(ch))
    )
    .replace(/[푎푏푐푑푒푓푔푕푖푗푘푙푚푛표푝푞푟푠푡푢푣푤푥푦푧]/g, (ch) =>
      String.fromCharCode("a".charCodeAt(0) + "푎푏푐푑푒푓푔푕푖푗푘푙푚푛표푝푞푟푠푡푢푣푤푥푦푧".indexOf(ch))
    )
    .replace(/훼/g, "α")
    .replace(/훽/g, "β")
    .replace(/휃/g, "θ")
    .replace(/휋/g, "π")
    .replace(/휇/g, "μ")
    .replace(/[∘]/g, "°")
    .replace(/[Ω]/g, "Ω")
    .replace(/[µ]/g, "μ")
    .replace(/[⋅•]/g, "·");
}

function normalizeUnitSpacing(text: string) {
  return text
    // Common OCR split for Celsius: "100 ° CC" / "100 ° C C"
    .replace(/([0-9])\s*(?:\n\s*)?[°]\s*(?:\n\s*)?(?:C\s*C|C{2,})\b/gi, "$1 °C")
    .replace(/([0-9])\s*(?:\n\s*)?[°]\s*(?:\n\s*)?C\b/gi, "$1 °C")
    .replace(/([0-9])\s*(?:\n\s*)?[°]\s*(?:\n\s*)?F\b/gi, "$1 °F")
    .replace(/([0-9])\s*(?:\n\s*)?[°]\s*(?:\n\s*)?K\b/gi, "$1 °K")
    // Keep spacing readable between number and symbol units.
    .replace(/(\d)\s*(Ω|μ|°C|°F|°K)(?=\s|$|[.,;:!?])/g, "$1 $2")
    .replace(/(\d)\s*μ\s*(A|s|F|H|V|W)\b/g, "$1 μ$2")
    .replace(/(\d)\s*(mA|kA|A|mV|V|kV|W|kW|N·m|Nm|Hz|kHz|MHz|GHz)\b/g, "$1 $2")
    .replace(/\bNm\b/g, "N·m")
    .replace(/\s*·\s*/g, "·");
}

export function normalizeSymbolArtifacts(input: string, options: SymbolNormalizeOptions = {}) {
  const normalizeNewlines = options.normalizeNewlines !== false;
  const collapseWhitespace = options.collapseWhitespace !== false;
  let out = String(input || "");
  if (normalizeNewlines) out = out.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  out = replaceOcrGlyphs(out);
  out = normalizeUnitSpacing(out);
  if (collapseWhitespace) {
    out = out
      .replace(/[ \t]+\n/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return out;
}
