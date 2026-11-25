import { LEGAL_DOCUMENT_VERSION } from "@/lib/legal";
import { getDocumentVersion } from "@/lib/document-version";
import { getSiteContent } from "@/lib/content-store";
import EditableInfoDocument from "@/components/legal/EditableInfoDocument";
import Link from "next/link";
import { legalValue } from "@/lib/legal";

export async function generateMetadata() {
  const content = await getSiteContent();
  return { title: content.pages["payment-delivery"] ? content.pages["payment-delivery"].title + " — Радуйка" : "Оплата и доставка — Радуйка" };
}

export const dynamic = "force-dynamic";

export default async function PaymentDeliveryPage() {
  const content = await getSiteContent();
  const sellerDetails = content.settings;
  if (content.pages["payment-delivery"]) return <EditableInfoDocument page={{ ...content.pages["payment-delivery"], version: getDocumentVersion(content, "payment-delivery", LEGAL_DOCUMENT_VERSION) }} settings={content.settings} />;

  return (
    <main className="legal-document">
      <p className="eyebrow">Условия заказа</p>
      <h1>Оплата и доставка</h1>
      <h2>Оплата</h2>
      <p>Стоимость товаров отображается на сайте в рублях. До оплаты покупатель получает информацию об итоговой стоимости подтверждённого заказа и, если применимо, стоимости доставки.</p>
      <p>Сейчас форма на сайте создаёт заказ без списания денег. После проверки заказа продавец направляет согласованный способ оплаты. При фактическом приёме оплаты продавец обязан выдать или направить кассовый чек в предусмотренном законом порядке.</p>

      <h2>Доставка</h2>
      <p>Доставка может выполняться привлечённым сервисом. Им передаются только сведения, необходимые для конкретной доставки: адрес, имя/контакт получателя и сведения, необходимые курьеру для передачи заказа.</p>
      <p>Точная стоимость доставки зависит от адреса и сообщается покупателю до оплаты. Если покупатель не согласен с рассчитанной стоимостью доставки до оплаты, он может отказаться от продолжения заказа без навязывания платной услуги.</p>

      <h2>Самовывоз</h2>
      <p>Адрес точки самовывоза, график и готовность конкретного заказа сообщаются на сайте и/или при подтверждении заказа. Юридический адрес продавца и адрес для претензий: {legalValue(sellerDetails.postalAddress || sellerDetails.legalAddress)}.</p>

      <h2>Кассовый чек</h2>
      <p>Покупателю необходимо предоставить телефон или e-mail, если это требуется для направления электронного чека. Данные банковской карты магазин самостоятельно не запрашивает и не хранит: ввод платёжных реквизитов должен происходить на защищённой стороне выбранного платёжного сервиса.</p>
      <p>Для интернет-расчётов касса и платёжная интеграция должны формировать обязательные реквизиты электронного чека, включая признак расчёта в Интернете, точный адрес сайта как место расчётов и предоставленный покупателем контакт для получения чека.</p>

      <h2>Информация при передаче заказа</h2>
      <p>При передаче дистанционно заказанного товара покупателю предоставляется предусмотренная законом письменная информация о товаре и о порядке и сроках возврата. Организационный способ передачи этой памятки продавец настраивает вместе с фактической схемой доставки.</p>

      <Link className="legal-back" href="/">← Вернуться в магазин</Link>
    </main>
  );
}
