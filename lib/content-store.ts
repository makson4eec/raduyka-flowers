import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseServiceRoleClient } from "./firebase/supabase-admin";
import { defaultSettings, type InfoPage, type SiteContent, type SiteSettings } from "./site-content";
import infoDefaults from "./info-defaults.json";
import { HttpSecurityError } from "./http-security";

export const infoPageIds = new Set(infoDefaults.map((page) => page.id));
function db() {
  const client = getSupabaseServiceRoleClient();
  if (!client) throw new Error("Supabase service role is not configured.");
  return client;
}
export async function readSiteContent(): Promise<SiteContent> {
  const { data, error } = await db().from("site_content").select("id,value,updated_at");
  if (error && error.code !== "PGRST205" && error.code !== "42P01") throw error;
  const content: SiteContent = { settings: { ...defaultSettings }, pages: {} };
  for (const row of data ?? []) {
    if (row.id === "settings") {
      content.settings = { ...defaultSettings, ...row.value as SiteSettings };
      content.settingsVersion = row.updated_at;
    }
    else if (infoPageIds.has(row.id)) content.pages[row.id] = row.value as InfoPage;
  }
  return content;
}
export const getSiteContent = unstable_cache(async () => {
  try { return await readSiteContent(); }
  catch { return { settings: { ...defaultSettings }, pages: {} } as SiteContent; }
}, ["site-content"], { revalidate: 300, tags: ["site-content"] });
export async function saveSiteContent(id: string, value: SiteSettings | InfoPage) {
  const updatedAt = new Date().toISOString();
  const { error } = await db().from("site_content").upsert({ id, value: id === "settings" ? value : { ...value, version: updatedAt }, updated_at: updatedAt });
  if (error?.code === "PGRST205" || error?.code === "42P01") throw new HttpSecurityError(503, "Сначала примените миграцию 2026-11-25-categories-and-product-images.sql в Supabase.");
  if (error) throw error;
}
export async function resetInfoPage(id: string) {
  const { error } = await db().from("site_content").delete().eq("id", id);
  if (error) throw error;
}
