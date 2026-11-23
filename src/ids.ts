// Makes the ids of an SVG fragment unique, so that the same face (or two) can sit twice in one SVG without sharing a clip path.
/** Prefixes every `id="…"`, `url(#…)` and `href="#…"` of a fragment. */
export function prefixIds(body: string, prefix: string): string {
  return body.replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${prefix}${id}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${prefix}${id})`)
    .replace(/\bhref="#([^"]+)"/g, (_m, id: string) => `href="#${prefix}${id}"`);
}
