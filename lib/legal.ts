export const LEGAL_DOCUMENT_VERSION = "17.08.2026";

/**
 * Заполните эти поля перед публичным запуском сайта.
 * Значения используются на всех юридических страницах и в подвале сайта.
 */
export const sellerDetails = {
  legalStatus: "ИП", // Например: ИП или ООО
  legalName: "Карасёва Юлия Васильевна", // Для ИП: ФИО полностью; для ООО: полное фирменное наименование
  inn: "667325529228",
  ogrn: "320665800036281", // ОГРНИП для ИП или ОГРН для ООО
  registrationAuthority: "Межрайонная инспекция Федеральной налоговой службы 32 по Свердловской области", // Для ИП: орган, осуществивший государственную регистрацию
  legalAddress: "г. Екатеринбург, ул. Библиотечная 43", // Обязательно для ООО; для ИП укажите адрес для претензий, если применимо
  postalAddress: "г. Екатеринбург, ул. Библиотечная 43", // Адрес для письменных претензий/корреспонденции
  email: "dgylia8049@gmail.com",
  phone: "+79502058895",
  website: "https://raduika.ru", // Например: https://raduyka.ru
  personalDataAddress: "dgylia8049@gmail.com", // Email или почтовый адрес для обращений по персональным данным
};

export function legalValue(value: string) {
  return value.trim() || "____________________________";
}

export function sellerDisplayName() {
  const parts = [sellerDetails.legalStatus.trim(), sellerDetails.legalName.trim()].filter(Boolean);
  return parts.length ? parts.join(" ") : "____________________________";
}
