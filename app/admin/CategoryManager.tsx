"use client";

import Image from "next/image";

import { useState } from "react";
import { readJson, uploadAdminImage } from "../../lib/admin-client";
import { optimizedImageSource } from "../../lib/image-assets";
import type { ShopCategory } from "../../lib/types";

export default function CategoryManager({ categories, productCounts, onSaved, onDeleted }: {
  categories: ShopCategory[];
  productCounts: Record<string, number>;
  onSaved: (category: ShopCategory) => void;
  onDeleted: (id: string, replacementId: string) => void;
}) {
  const [draft, setDraft] = useState<ShopCategory | null>(null);
  const [deleting, setDeleting] = useState<ShopCategory | null>(null);
  const [replacementId, setReplacementId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const close = () => { if (!busy) { setDraft(null); setError(""); } };

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.image) { setError("Укажите название и фотографию категории."); return; }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/categories${draft.id ? `/${draft.id}` : ""}`, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      onSaved((await readJson<{ category: ShopCategory }>(response)).category);
      setDraft(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось сохранить категорию."); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    setError("");
    try {
      const search = new URLSearchParams({ replacementId });
      await readJson(await fetch(`/api/admin/categories/${deleting.id}?${search}`, { method: "DELETE" }));
      onDeleted(deleting.id, replacementId);
      setDeleting(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось удалить категорию."); }
    finally { setBusy(false); }
  };

  return (
    <section className="admin-section">
      <div className="admin-section__head">
        <div><p>Разделы магазина</p><h2>Категории</h2></div>
        <button className="admin-primary" disabled={busy} onClick={() => {
          setError("");
          setDraft({ id: "", name: "", description: "", image: "", target: "catalog", theme: "cream", visible: true, sortOrder: Math.max(0, ...categories.map((c) => c.sortOrder)) + 10 });
        }}>＋ Добавить категорию</button>
      </div>
      {error && !draft && !deleting && <p className="admin-error" role="alert">{error}</p>}
      <div className="admin-products">
        {categories.map((category) => (
          <article key={category.id} className={`admin-product ${category.visible ? "" : "is-hidden"}`}>
            <Image unoptimized width={180} height={150} src={optimizedImageSource(category.image)} alt={category.name} />
            <div className="admin-product__main"><h3>{category.name}</h3><p>{category.description}</p><small>{category.visible ? "На витрине" : "Скрыта"} · Товаров: {productCounts[category.id] ?? 0} · Порядок: {category.sortOrder}</small></div>
            <div className="admin-product__actions">
              <button disabled={busy} onClick={() => { setDraft({ ...category }); setError(""); }}>Изменить</button>
              <button className="is-danger" disabled={busy} onClick={() => {
                setError("");
                setReplacementId("");
                setDeleting(category);
              }}>Удалить</button>
            </div>
          </article>
        ))}
        {!categories.length && <p>Категорий пока нет. Добавьте первую категорию.</p>}
      </div>
      {deleting && <div className="admin-modal" role="dialog" aria-modal="true" aria-label="Удаление категории">
        <button className="admin-modal__backdrop" aria-label="Закрыть" disabled={busy} onClick={() => setDeleting(null)} />
        <form className="admin-product-form" onSubmit={(event) => { event.preventDefault(); void remove(); }}>
          <header><div><p>Удаление категории</p><h2>{deleting.name}</h2></div><button type="button" disabled={busy} aria-label="Закрыть" onClick={() => setDeleting(null)}>×</button></header>
          <p>Товары сохранятся. Их можно перенести в другую категорию или оставить в общем каталоге.</p>
          {deleting.target !== "delivery" && <div className="admin-form-grid">
            <label className="span-2">Что сделать с товарами<select aria-label="Что сделать с товарами" value={replacementId} disabled={busy} onChange={(event) => setReplacementId(event.target.value)}>
              <option value="">Оставить без категории</option>
              {categories.filter((category) => category.id !== deleting.id && category.target === deleting.target).map((category) => (
                <option key={category.id} value={category.id}>{category.name.replaceAll("\n", " ")}</option>
              ))}
            </select></label>
          </div>}
          {error && <p className="admin-error" role="alert">{error}</p>}
          <footer><button className="admin-secondary" type="button" disabled={busy} onClick={() => setDeleting(null)}>Отмена</button><button className="admin-primary" disabled={busy}>{busy ? "Удаляем…" : "Удалить категорию"}</button></footer>
        </form>
      </div>}
      {draft && <div className="admin-modal" role="dialog" aria-modal="true" aria-label={draft.id ? "Редактирование категории" : "Новая категория"}>
        <button className="admin-modal__backdrop" aria-label="Закрыть" disabled={busy} onClick={close} />
        <form className="admin-product-form" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <header><div><p>Категория магазина</p><h2>{draft.id ? "Редактировать категорию" : "Добавить категорию"}</h2></div><button type="button" disabled={busy} aria-label="Закрыть" onClick={close}>×</button></header>
          <div className="admin-image-field">
            {draft.image ? <Image unoptimized width={180} height={150} src={optimizedImageSource(draft.image)} alt="Фото категории" /> : <div className="admin-photo-empty">Нет фото</div>}
            <label>{busy ? "Подождите…" : "Загрузить фото категории"}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={async (event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              setBusy(true); setError("");
              try { const image = await uploadAdminImage(file); setDraft((current) => current ? { ...current, image } : current); }
              catch (cause) { setError(cause instanceof Error ? cause.message : "Не удалось загрузить фото."); }
              finally { setBusy(false); }
            }} /></label><small>JPG, PNG или WebP, до 5 МБ</small>
          </div>
          <fieldset className="admin-form-grid admin-fieldset" disabled={busy}>
            <label className="span-2">Название<textarea required maxLength={120} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /><small>Перенос строки сохраняется на карточке.</small></label>
            <label className="span-2">Описание<textarea maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
            <label>Содержимое<select disabled={Boolean(draft.id)} value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value as ShopCategory["target"] })}><option value="catalog">Готовые товары</option><option value="flowers">Цветы поштучно</option><option value="delivery">Страница доставки</option></select></label>
            <label>Фон карточки<select value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value as ShopCategory["theme"] })}><option value="cream">Светлый</option><option value="blush">Розовый</option></select></label>
            <label>Порядок<input type="number" min={0} max={1000000} value={draft.sortOrder} onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) })} /></label>
            <label className="admin-check"><input type="checkbox" checked={draft.visible} onChange={(e) => setDraft({ ...draft, visible: e.target.checked })} /><span>Показывать категорию</span></label>
          </fieldset>
          {error && <p className="admin-error" role="alert">{error}</p>}
          <footer><button className="admin-secondary" type="button" disabled={busy} onClick={close}>Отмена</button><button className="admin-primary" disabled={busy}>{busy ? "Сохраняем…" : "Сохранить категорию"}</button></footer>
        </form>
      </div>}
    </section>
  );
}
