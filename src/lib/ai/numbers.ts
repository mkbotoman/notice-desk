/**
 * The guard behind "every number must come from the data". AI text is checked after the fact:
 * any figure the model wrote that isn't in the source material means the text is rejected and
 * the template is used instead.
 */

const NUMBER = /\d[\d,]*(?:\.\d+)?/g;

/** "1,234.50" becomes "1234.5" and "007" becomes "7", so formatting differences don't matter. */
function normalize(token: string): string {
  const plain = token.replace(/,/g, '');
  const value = Number(plain);
  return Number.isFinite(value) ? String(value) : plain;
}

/** Every distinct numeric figure in the text, normalized. Words like "three" are not figures. */
export function numbersIn(text: string): Set<string> {
  return new Set((text.match(NUMBER) ?? []).map(normalize));
}

/**
 * The figures in `text` that appear nowhere in `sources`. An empty result means every figure
 * the model wrote can be traced to the data it was given.
 */
export function unexpectedNumbers(text: string, sources: readonly string[]): string[] {
  const allowed = new Set(sources.flatMap((s) => [...numbersIn(s)]));
  return [...numbersIn(text)].filter((n) => !allowed.has(n));
}
