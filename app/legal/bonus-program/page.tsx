import { getDocumentVersion } from "@/lib/document-version";
import { getSiteContent } from "@/lib/content-store";
import EditableInfoDocument from "@/components/legal/EditableInfoDocument";
import Link from "next/link";
import {
  BONUS_EARN_PERCENT,
  BONUS_RUBLE_VALUE,
  BONUS_SPEND_PERCENT,
} from "@/lib/bonus-rules";
import { LEGAL_DOCUMENT_VERSION as ORIGINAL_LEGAL_DOCUMENT_VERSION } from "@/lib/legal";

export async function generateMetadata() {
  const content = await getSiteContent();
  return { title: content.pages["bonus-program"] ? content.pages["bonus-program"].title + " — Радуйка" : "Правила бонусной программы — Радуйка" };
}

export const dynamic = "force-dynamic";

export default async function BonusProgramPage() {
  const content = await getSiteContent();
  const LEGAL_DOCUMENT_VERSION = getDocumentVersion(content, "bonus-program", ORIGINAL_LEGAL_DOCUMENT_VERSION);
  const sellerDisplayName = () => [content.settings.legalStatus, content.settings.legalName].filter(Boolean).join(" ");
  if (content.pages["bonus-program"]) return <EditableInfoDocument page={{ ...content.pages["bonus-program"], version: getDocumentVersion(content, "bonus-program", LEGAL_DOCUMENT_VERSION) }} settings={content.settings} />;

  return (
    <main className="legal-document">
      <p className="eyebrow">Программа лояльности</p>
      <h1>Правила бонусной программы</h1>
      <div className="legal-meta">Редакция от {LEGAL_DOCUMENT_VERSION}</div>

      <h2>1. Организатор и участники</h2>
      <p>
        Организатор программы — {sellerDisplayName()}. Участвовать могут зарегистрированные
        пользователи сайта, для которых создан бонусный баланс. Участие не является обязательным
        условием покупки товара без использования бонусов.
      </p>

      <h2>2. Бонусный баланс</h2>
      <p>
        Бонусы являются условными единицами программы и не являются денежными средствами,
        электронными деньгами или самостоятельным платёжным средством. Для расчёта скидки
        {` ${BONUS_RUBLE_VALUE} бонус соответствует ${BONUS_RUBLE_VALUE} рублю скидки`} в пределах,
        установленных настоящими правилами.
      </p>

      <h2>3. Приветственные бонусы</h2>
      <p>
        После подтверждения адреса электронной почты зарегистрированному пользователю однократно
        начисляется 1 000 приветственных бонусов, если технические условия программы выполнены и
        такое начисление ранее не производилось.
      </p>

      <h2>4. Списание бонусов</h2>
      <p>
        При наличии достаточного баланса пользователь может применить бонусы при оформлении заказа.
        Максимальный размер бонусной скидки составляет {BONUS_SPEND_PERCENT}% от стоимости товаров и
        платных дополнений, участвующих в расчёте. Стоимость доставки в бонусный расчёт не входит.
        Фактический размер списания показывается до отправки заказа.
      </p>

      <h2>5. Начисление за заказ</h2>
      <p>
        После того как заказ одновременно отмечен как оплаченный и выполненный, начисляется
        {` ${BONUS_EARN_PERCENT}%`} от части стоимости товаров и платных дополнений, фактически
        оплаченной не бонусами. Расчёт производится в целых бонусах с округлением вниз.
      </p>

      <h2>6. Отмена и возврат</h2>
      <p>
        При отмене заказа зарезервированные для него бонусы возвращаются на баланс. Если по заказу
        уже были начислены бонусы, при отмене или возврате они могут быть сторнированы в объёме,
        относящемся к этому заказу. Эти операции не ограничивают предусмотренное законом право
        покупателя на возврат денежных средств.
      </p>

      <h2>7. Ошибки и злоупотребления</h2>
      <p>
        При технической ошибке, двойном начислении или использовании программы с целью обхода её
        правил организатор вправе исправить ошибочную бонусную операцию после проверки. Денежная
        стоимость уже оплаченного заказа и обязательные права потребителя из-за этого не изменяются.
      </p>

      <h2>8. Изменение правил</h2>
      <p>
        Актуальная редакция постоянно размещается на этой странице. Изменения применяются на будущее
        с даты их публикации и не могут отменять обязательные права потребителя. Условия конкретного
        уже оформленного заказа определяются правилами, действовавшими при его оформлении, если иное
        не требуется законом.
      </p>

      <p>
        Условия продажи товаров также приведены в <Link href="/legal/offer">публичной оферте</Link>.
      </p>
      <Link className="legal-back" href="/">← Вернуться в магазин</Link>
    </main>
  );
}
