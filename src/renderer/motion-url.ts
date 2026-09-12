import type { CatalogItem } from "../shared/types";

/** Join a motions directory URL with a catalog-relative motion path. */
export function joinMotionUrl(base: string | null | undefined, relative: string): string | null {
  const rel = relative.trim().replace(/\\/g, "/");
  if (!rel) return null;
  if (/^(file|https?):/i.test(rel)) return rel;
  if (!base) return null;
  const root = base.replace(/[/\\]+$/, "");
  const path = rel.replace(/^[/\\]+/, "");
  const normalized = path.replace(/^motions\//i, "");
  const encoded = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => (/%[0-9A-Fa-f]{2}/.test(segment) ? segment : encodeURIComponent(segment)))
    .join("/");
  return `${root}/${encoded}`;
}

/** Candidate relative paths for a catalog item, in try order. */
export function catalogMotionRefs(item: CatalogItem): string[] {
  const refs: string[] = [];
  const push = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (trimmed && !refs.includes(trimmed)) refs.push(trimmed);
  };
  push(item.path);
  push(item.file);
  if (!item.path && !item.file && item.id) {
    push(`${item.id}.motion3.json`);
  }
  return refs;
}

export function motionUrlsForItem(
  item: CatalogItem | null,
  base: string | null | undefined,
): string[] {
  if (!item) return [];
  return catalogMotionRefs(item)
    .map((ref) => joinMotionUrl(base, ref))
    .filter((url): url is string => Boolean(url));
}

/** Prefer the body clip file when both layers resolve; Cubism plays one queued motion. */
export function pickMotionUrls(
  face: CatalogItem | null,
  body: CatalogItem | null,
  base: string | null | undefined,
): { primary: string[]; secondary: string[]; prefer: "body" | "face" | null } {
  const bodyUrls = motionUrlsForItem(body, base);
  const faceUrls = motionUrlsForItem(face, base);
  if (bodyUrls.length) return { primary: bodyUrls, secondary: faceUrls, prefer: "body" };
  if (faceUrls.length) return { primary: faceUrls, secondary: [], prefer: "face" };
  return { primary: [], secondary: [], prefer: null };
}
