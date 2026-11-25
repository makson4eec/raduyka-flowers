import type { ReactNode } from "react";
import type { SiteSettings } from "../lib/site-content";
import { safeContentHref } from "../lib/info-links";
import { LEGAL_DOCUMENT_VERSION } from "../lib/legal";

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^\s)]+\))/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part);
    if (link) {
      const href = safeContentHref(link[2]);
      return href ? <a key={index} href={href}>{link[1]}</a> : link[1];
    }
    return part;
  });
}

export function InfoBody({ body, settings, version }: { body: string; settings?: SiteSettings; version?: string }) {
  const text = settings ? body.replace(/\{\{([a-zA-Z]+)\}\}/g, (token, key: string) => (
    key === "documentVersion" ? version || LEGAL_DOCUMENT_VERSION : Object.hasOwn(settings, key) ? settings[key as keyof SiteSettings] : token
  )) : body;
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i].trim();
    if (!line) { i += 1; continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(heading[1].length < 3 ? <h2 key={i}>{inline(heading[2])}</h2> : <h3 key={i}>{inline(heading[2])}</h3>);
      i += 1; continue;
    }
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\./.test(line);
      const items: ReactNode[] = [];
      const pattern = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const key = i;
      while (i < lines.length && pattern.test(lines[i].trim())) {
        items.push(<li key={i}>{inline(lines[i].trim().replace(pattern, ""))}</li>); i += 1;
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>); continue;
    }
    const paragraph = [line];
    const key = i++;
    while (i < lines.length && lines[i].trim() && !/^(?:#{1,3}\s|[-*]\s|\d+\.\s)/.test(lines[i].trim())) paragraph.push(lines[i++].trim());
    blocks.push(<p key={key}>{paragraph.map((part, j) => <span key={j}>{j > 0 && <br />}{inline(part)}</span>)}</p>);
  }
  return <div className="info-content">{blocks}</div>;
}
