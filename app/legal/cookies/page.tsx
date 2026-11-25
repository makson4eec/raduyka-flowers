import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";
import { getDocumentVersion } from "@/lib/document-version";
import { getSiteContent } from "@/lib/content-store";
import EditableInfoDocument from "@/components/legal/EditableInfoDocument";
import Link from "next/link";

export async function generateMetadata() {
  const content = await getSiteContent();
  return { title: content.pages["cookies"] ? content.pages["cookies"].title + " — Радуйка" : "Политика cookies — Радуйка" };
}

export const dynamic = "force-dynamic";

export default async function CookiesPage() {
  const content = await getSiteContent();
  if (content.pages["cookies"]) return <EditableInfoDocument page={{ ...content.pages["cookies"], version: getDocumentVersion(content, "cookies", LEGAL_DOCUMENT_VERSION) }} settings={content.settings} />;

  return (
    <main className="legal-document">
      <p className="eyebrow">Технические данные</p>
      <h1>Политика использования cookies</h1>
      <h2>Что используется</h2>
      <p>Сайт использует технически необходимые cookies и аналогичные технологии браузера для авторизации, защиты сессии и сохранения настроек. В localStorage могут храниться избранные товары и технический идентификатор push-подписки, если пользователь сам включил уведомления. В sessionStorage временно хранится номер последнего заказа для показа его статуса в текущей сессии.</p>

      <h2>Необязательные трекеры</h2>
      <p>В текущую версию сайта не должны добавляться рекламные пиксели или необязательная аналитика без предварительной проверки правового основания. Если такие инструменты появятся, интерфейс управления согласием и эта политика должны быть обновлены до их включения.</p>

      <h2>Как удалить данные</h2>
      <p>Пользователь может удалить cookies и локальные данные в настройках браузера. Удаление технических cookies авторизации может привести к выходу из личного кабинета.</p>
      <p>Подробнее об обработке персональных данных: <Link href="/legal/privacy">Политика обработки персональных данных</Link>.</p>
      <Link className="legal-back" href="/">← Вернуться в магазин</Link>
    </main>
  );
}
