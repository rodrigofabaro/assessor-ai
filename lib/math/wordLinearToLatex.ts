export function convertWordLinearToLatex(input: string): string {
  let out = String(input || "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/−/g, "-")
    .trim();

  if (!out) return out;

  // Common function names.
  out = out
    .replace(/\blog_e\s*\(/gi, "\\log_{e}(")
    .replace(/\blog\s*e\s*\(/gi, "\\log_{e}(")
    .replace(/\bln\s*\(/gi, "\\ln(")
    .replace(/\bsin\s*\(/gi, "\\sin(")
    .replace(/\bcos\s*\(/gi, "\\cos(")
    .replace(/\btan\s*\(/gi, "\\tan(");

  // sqrt(expr) -> \sqrt{expr}
  out = out.replace(/\bsqrt\s*\(([^()]+)\)/gi, (_m, inner) => `\\sqrt{${String(inner).trim()}}`);

  // e^-0.2t / e^-(...) -> e^{-...}
  out = out
    .replace(/([0-9])e\^\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)/gi, (_m, coeff, exp) => {
      return `${String(coeff)}e^{-${String(exp).replace(/\s+/g, "")}}`;
    })
    .replace(/([0-9])e\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)/gi, (_m, coeff, exp) => {
      return `${String(coeff)}e^{-${String(exp).replace(/\s+/g, "")}}`;
    })
    .replace(/([0-9])e-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)/gi, (_m, coeff, exp) => {
      return `${String(coeff)}e^{-${String(exp).replace(/\s+/g, "")}}`;
    })
    .replace(/\be\^\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be\^\s*-\s*\(([^)]+)\)/gi, (_m, exp) => `e^{-(${String(exp).trim()})}`)
    .replace(/\be\s*-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`)
    .replace(/\be-\s*([0-9]+(?:\.[0-9]+)?(?:\s*[A-Za-z]+)?)\b/gi, (_m, exp) => `e^{-${String(exp).replace(/\s+/g, "")}}`);

  // ^(expr) -> ^{expr}
  out = out.replace(/\^\s*\(([^)]+)\)/g, (_m, exp) => `^{${String(exp).trim()}}`);

  // a/b and (a+b)/(c+d) -> \frac{a}{b} (conservative).
  out = out
    .replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, (_m, a, b) => `\\frac{${String(a).trim()}}{${String(b).trim()}}`)
    .replace(/\b([A-Za-z0-9.+-]+)\s*\/\s*([A-Za-z0-9.+-]+)\b/g, (_m, a, b) => `\\frac{${String(a).trim()}}{${String(b).trim()}}`);

  return out.replace(/\s+/g, " ").trim();
}
