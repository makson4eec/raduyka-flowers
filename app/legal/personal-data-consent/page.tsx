import { getDocumentVersion } from "@/lib/document-version";
import { getSiteContent } from "@/lib/content-store";
import EditableInfoDocument from "@/components/legal/EditableInfoDocument";
import Link from "next/link";
import { LEGAL_DOCUMENT_VERSION as ORIGINAL_LEGAL_DOCUMENT_VERSION, legalValue } from "@/lib/legal";

export async function generateMetadata() {
  const content = await getSiteContent();
  return { title: content.pages["personal-data-consent"] ? content.pages["personal-data-consent"].title + " — Радуйка" : "Согласие на обработку персональных данных — Радуйка" };
}

export const dynamic = "force-dynamic";

export default async function PersonalDataConsentPage() {
  const content = await getSiteContent();
  const LEGAL_DOCUMENT_VERSION = getDocumentVersion(content, "personal-data-consent", ORIGINAL_LEGAL_DOCUMENT_VERSION);
  const sellerDetails = content.settings;
  const sellerDisplayName = () => [content.settings.legalStatus, content.settings.legalName].filter(Boolean).join(" ");
  if (content.pages["personal-data-consent"]) return <EditableInfoDocument page={{ ...content.pages["personal-data-consent"], version: getDocumentVersion(content, "personal-data-consent", LEGAL_DOCUMENT_VERSION) }} settings={content.settings} />;

  return (
    <main className="legal-document">
      <p className="eyebrow">Отдельный документ</p>
      <h1>Согласие на обработку персональных данных</h1>
      <div className="legal-meta">Версия согласия: {LEGAL_DOCUMENT_VERSION}</div>
      <p>Я, пользователь, создающий учётную запись на сайте {legalValue(sellerDetails.website)}, свободно, своей волей и в своём интересе даю {sellerDisplayName()}, ИНН {legalValue(sellerDetails.inn)}, адрес: {legalValue(sellerDetails.legalAddress)}, согласие на обработку моих персональных данных на условиях ниже.</p>

      <h2>1. Цель согласия</h2>
      <p>Согласие даётся для создания и обслуживания добровольной учётной записи пользователя, предоставления личного кабинета и связанных с ним необязательных функций сайта, включая бонусный баланс и сохранённые пользователем напоминания.</p>
      <p>Обработка сведений, объективно необходимых для заключения и исполнения отдельного заказа, возврата, исполнения требований закона или защиты законных требований, может осуществляться на самостоятельных предусмотренных законом основаниях и не ставится в зависимость от этого согласия.</p>

      <h2>2. Какие данные обрабатываются по согласию</h2>
      <ul>
        <li>имя, указанное при регистрации;</li>
        <li>адрес электронной почты;</li>
        <li>идентификатор учётной записи и технические данные, необходимые для авторизации и защиты аккаунта;</li>
        <li>данные бонусного баланса и технические сведения о связанных с аккаунтом операциях;</li>
        <li>если пользователь сам включает напоминания: название события, дата и необязательное имя человека;</li>
        <li>если пользователь сам включает push-уведомления: технический идентификатор подписки/устройства, необходимый для доставки сервисного уведомления.</li>
      </ul>
      <p>Не указывайте в названиях напоминаний и других свободных полях сведения о здоровье, политических взглядах, религии, интимной жизни и иные специальные категории персональных данных.</p>

      <h2>3. Действия с данными и способы обработки</h2>
      <p>Согласие предоставляется на сбор, запись, систематизацию, накопление, хранение, уточнение, извлечение, использование, предоставление лицам, законно привлечённым для технического обслуживания соответствующей функции, блокирование, удаление и уничтожение персональных данных с использованием средств автоматизации и без их использования, когда это необходимо для указанной цели.</p>

      <h2>4. Срок действия и отзыв</h2>
      <p>Согласие действует до удаления учётной записи, достижения соответствующих целей либо до его отзыва — в зависимости от того, что наступит раньше, если более длительная обработка не требуется по закону и отсутствует другое законное основание. Отозвать согласие можно по адресу: {legalValue(sellerDetails.personalDataAddress || sellerDetails.email)}.</p>
      <p>Отзыв согласия не влияет на законность обработки, выполненной до получения отзыва. После отзыва оператор вправе продолжить обработку только при наличии другого основания, прямо предусмотренного законодательством.</p>

      <h2>5. Лица, обрабатывающие данные по поручению</h2>
      <p>Если оператор поручает обработку данных поставщику хостинга, авторизации или технических уведомлений, такое поручение должно быть оформлено в соответствии с законом. Фактический перечень используемых сервисов и условия передачи отражаются в <Link href="/legal/privacy">Политике обработки персональных данных</Link> и внутренних документах оператора.</p>

      <Link className="legal-back" href="/">← Вернуться в магазин</Link>
    </main>
  );
}
