/** FNV-1a, 32-bit, as 8 hex chars. Used to key generated data by code text,
 *  identically in the browser and in scripts/check-content.ts. */
export function hashCode(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
