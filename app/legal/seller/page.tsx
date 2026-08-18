import Link from "next/link";
import { legalValue, sellerDetails, sellerDisplayName } from "@/lib/legal";

export const metadata = { title: "Сведения о продавце — Радуйка" };

export default function SellerPage() {
  return (
    <main className="legal-document">
      <p className="eyebrow">Информация для покупателей</p>
      <h1>Сведения о продавце</h1>
      <div className="legal-warning">
        <b>Перед запуском магазина заполните все пустые поля в <code>lib/legal.ts</code>.</b>
        <p>До заполнения реквизитов эта страница является шаблоном и не должна использоваться как окончательная информация о продавце.</p>
      </div>
      <div className="legal-requisites">
        <p><b>Продавец:</b> {sellerDisplayName()}</p>
        <p><b>ИНН:</b> {legalValue(sellerDetails.inn)}</p>
        <p><b>ОГРН / ОГРНИП:</b> {legalValue(sellerDetails.ogrn)}</p>
        <p><b>Орган государственной регистрации (для ИП):</b> {legalValue(sellerDetails.registrationAuthority)}</p>
        <p><b>Адрес / место нахождения:</b> {legalValue(sellerDetails.legalAddress)}</p>
        <p><b>Адрес для корреспонденции и претензий:</b> {legalValue(sellerDetails.postalAddress)}</p>
        <p><b>E-mail:</b> {legalValue(sellerDetails.email)}</p>
        <p><b>Телефон:</b> {legalValue(sellerDetails.phone)}</p>
        <p><b>Сайт:</b> {legalValue(sellerDetails.website)}</p>
      </div>
      <h2>Как направить претензию</h2>
      <p>Претензию можно направить в свободной форме на электронную почту продавца либо почтовым отправлением по адресу для корреспонденции, указанному выше. Укажите номер заказа или иные сведения, позволяющие идентифицировать покупку, ваши контактные данные, требование и обстоятельства, на которых оно основано.</p>
      <p>Если требование связано с возвратом денежных средств, способ возврата определяется законом и применимым способом оплаты. Продавец не вправе требовать передачи полных реквизитов банковской карты.</p>
      <Link className="legal-back" href="/">← Вернуться в магазин</Link>
    </main>
  );
}
