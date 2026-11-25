import type { SiteContent } from "./site-content";

/** Settings can change the seller details interpolated into a document. */
export function getDocumentVersion(content: Pick<SiteContent, "pages" | "settingsVersion">, id: string, fallback: string): string {
  return [content.pages[id]?.version, content.settingsVersion]
    .filter((version): version is string => typeof version === "string" && Boolean(version))
    .sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) || fallback;
}
