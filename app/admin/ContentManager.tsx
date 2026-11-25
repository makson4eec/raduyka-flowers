"use client";

import { useEffect, useState } from "react";
import { InfoBody } from "../../components/InfoContent";
import { readJson } from "../../lib/admin-client";
import { defaultSettings, type InfoPage, type SiteContent, type SiteSettings } from "../../lib/site-content";
import infoDefaults from "../../lib/info-defaults.json";

const labels: Record<keyof SiteSettings, string> = {
  address: "Адрес магазина / самовывоза", phone: "Телефон", email: "E-mail", hoursWeekdays: "Режим работы в будни", hoursWeekend: "Режим работы в выходные",
  mapLink: "Ссылка на карту", mapEmbedUrl: "Ссылка на встроенную карту Яндекса", legalStatus: "Статус продавца (ИП / ООО)", legalName: "ФИО / наименование продавца",
  inn: "ИНН", ogrn: "ОГРН / ОГРНИП", registrationAuthority: "Орган государственной регистрации", legalAddress: "Юридический адрес", postalAddress: "Адрес для корреспонденции и претензий",
  website: "Адрес сайта", personalDataAddress: "Контакт по вопросам персональных данных",
};
const makePages = (overrides: Record<string, InfoPage>) => Object.fromEntries(infoDefaults.map((page) => [page.id, overrides[page.id] ?? { title: page.title, body: page.body }]));

export default function ContentManager() {
  const [settings, setSettings] = useState<SiteSettings>(defaultSettings);
  const [pages, setPages] = useState<Record<string, InfoPage>>(() => makePages({}));
  const [selected, setSelected] = useState("settings");
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = async () => {
    try {
      const payload = await readJson<SiteContent>(await fetch("/api/admin/content", { cache: "no-store" }));
      setSettings(payload.settings); setPages(makePages(payload.pages)); setLoadFailed(false);
    } catch (cause) { setLoadFailed(true); setError(cause instanceof Error ? cause.message : "Не удалось загрузить информацию."); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let active = true;
    void fetch("/api/admin/content", { cache: "no-store" })
      .then((response) => readJson<SiteContent>(response))
      .then((payload) => {
        if (active) { setSettings(payload.settings); setPages(makePages(payload.pages)); }
      })
      .catch((cause: unknown) => {
        if (active) { setLoadFailed(true); setError(cause instanceof Error ? cause.message : "Не удалось загрузить информацию."); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const save = async () => {
    setSaving(true); setError(""); setNotice("");
    try {
      await readJson(await fetch("/api/admin/content", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: selected, value: selected === "settings" ? settings : pages[selected] }) }));
      setNotice("Изменения сохранены и опубликованы на сайте.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить информацию."); }
    finally { setSaving(false); }
  };
  const reset = async () => {
    if (!window.confirm("Вернуть исходный текст и оформление этой страницы? Опубликованные изменения будут удалены.")) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await readJson(await fetch(`/api/admin/content?id=${encodeURIComponent(selected)}`, { method: "DELETE" }));
      const original = infoDefaults.find((page) => page.id === selected)!;
      setPages((current) => ({ ...current, [selected]: { title: original.title, body: original.body } }));
      setNotice("Исходная страница восстановлена.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось восстановить страницу."); }
    finally { setSaving(false); }
  };
  if (loading) return <div className="admin-loading">Загружаем информацию…</div>;
  if (loadFailed) return <div className="admin-alert" role="alert">{error}<button onClick={() => { setLoading(true); setError(""); void load(); }}>Повторить</button></div>;
  return <section className="admin-section">
    <div className="admin-section__head"><div><p>Содержание сайта</p><h2>Информация</h2></div></div>
    <form className="admin-content-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <fieldset className="admin-fieldset" disabled={saving}>
        <label className="admin-content-selection">Раздел<select aria-label="Раздел" value={selected} onChange={(e) => { setSelected(e.target.value); setError(""); setNotice(""); setPreview(false); }}><option value="settings">Контакты, режим работы и реквизиты</option>{infoDefaults.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}</select></label>
        {selected === "settings" ? <div className="admin-form-grid">{(Object.keys(labels) as Array<keyof SiteSettings>).map((field) => <label key={field}>{labels[field]}<input type={field === "email" ? "email" : ["website", "mapLink", "mapEmbedUrl"].includes(field) ? "url" : "text"} maxLength={1000} value={settings[field]} onChange={(e) => setSettings({ ...settings, [field]: e.target.value })} /></label>)}</div> : <div className="admin-content-editor">
          <label>Заголовок страницы<input required maxLength={200} value={pages[selected].title} onChange={(e) => setPages({ ...pages, [selected]: { ...pages[selected], title: e.target.value } })} /></label>
          <div className="admin-content-toolbar"><button type="button" className="admin-secondary" onClick={() => setPreview(!preview)}>{preview ? "Редактировать текст" : "Предпросмотр"}</button><button type="button" className="admin-secondary" onClick={() => void reset()}>Вернуть исходную страницу</button></div>
          {preview ? <div className="admin-content-preview"><h1>{pages[selected].title}</h1><InfoBody body={pages[selected].body} settings={settings} /></div> : <label>Текст страницы<textarea required maxLength={80000} value={pages[selected].body} onChange={(e) => setPages({ ...pages, [selected]: { ...pages[selected], body: e.target.value } })} /><small>Абзацы разделяйте пустой строкой. Для подзаголовка: ## Заголовок, для списка: - Пункт, для выделения: **текст**, для ссылки: [текст](https://адрес). Контакты в местах {"{{phone}}"}, {"{{email}}"}, {"{{address}}"} обновляются из настроек магазина.</small></label>}
        </div>}
      </fieldset>
      {error && <p className="admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-warning" role="status">{notice}</p>}
      <footer><button className="admin-primary" disabled={saving}>{saving ? "Сохраняем…" : "Сохранить изменения"}</button></footer>
    </form>
  </section>;
}
