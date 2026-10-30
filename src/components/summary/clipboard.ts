/**
 * Copies the plain text, and the HTML alongside it where the browser allows. Falls back to
 * plain text alone. Only ever called from a click, so it never triggers a permissions prompt
 * on load. Returns whether anything was copied.
 */
export async function copyRichText(text: string, html: string): Promise<boolean> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  if (!clipboard) return false;
  if (typeof ClipboardItem !== 'undefined' && typeof clipboard.write === 'function') {
    try {
      await clipboard.write([
        new ClipboardItem({
          'text/plain': new Blob([text], { type: 'text/plain' }),
          'text/html': new Blob([html], { type: 'text/html' }),
        }),
      ]);
      return true;
    } catch {
      // Some browsers refuse rich items; plain text below still works.
    }
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
