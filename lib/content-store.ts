import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseServiceRoleClient } from "./firebase/supabase-admin";
import { defaultSettings, type InfoPage, type SiteContent, type SiteSettings } from "./site-content";
import infoDefaults from "./info-defaults.json";
import { HttpSecurityError } from "./http-security";
import { isInfoBlockSection, type InfoBlockValues } from "./info-blocks";

export const infoPageIds = new Set(infoDefaults.map((page) => page.id));
function db() {
  const client = getSupabaseServiceRoleClient();
  if (!client) throw new Error("Supabase service role is not configured.");
  return client;
}
export async function readSiteContent(): Promise<SiteContent> {
  const { data, error } = await db().from("site_content").select("id,value,updated_at");
  if (error && error.code !== "PGRST205" && error.code !== "42P01") throw error;
  const blocks: NonNullable<SiteContent["blocks"]> = {};
  const content: SiteContent = { settings: { ...defaultSettings }, pages: {}, blocks };
  for (const row of data ?? []) {
    if (row.id === "settings") {
      content.settings = { ...defaultSettings, ...row.value as SiteSettings };
      content.settingsVersion = row.updated_at;
    }
    else if (infoPageIds.has(row.id)) content.pages[row.id] = row.value as InfoPage;
    else if (isInfoBlockSection(row.id)) blocks[row.id] = row.value as InfoBlockValues;
  }
  return content;
}
export const getSiteContent = unstable_cache(async () => {
  try { return await readSiteContent(); }
  catch { return { settings: { ...defaultSettings }, pages: {} } as SiteContent; }
}, ["site-content"], { revalidate: 300, tags: ["site-content"] });
export async function saveSiteContent(id: string, value: SiteSettings | InfoPage | InfoBlockValues) {
  const updatedAt = new Date().toISOString();
  const { error } = await db().from("site_content").upsert({ id, value: infoPageIds.has(id) ? { ...value, version: updatedAt } : value, updated_at: updatedAt });
  if (error?.code === "PGRST205" || error?.code === "42P01") throw new HttpSecurityError(503, "Сначала примените миграцию 2026-11-25-categories-and-product-images.sql в Supabase.");
  if (error) throw error;
}
export async function resetInfoPage(id: string) {
  const { error } = await db().from("site_content").delete().eq("id", id);
  if (error) throw error;
}
