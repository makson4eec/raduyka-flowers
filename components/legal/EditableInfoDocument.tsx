import Link from "next/link";
import { InfoBody } from "../InfoContent";
import type { InfoPage, SiteSettings } from "../../lib/site-content";

export default function EditableInfoDocument({ page, settings }: { page: InfoPage; settings: SiteSettings }) {
  return <main className="legal-document"><h1>{page.title}</h1><InfoBody body={page.body} settings={settings} version={page.version} /><Link className="legal-back" href="/">← Вернуться в магазин</Link></main>;
}
