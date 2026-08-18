export const LEGAL_DOCUMENT_VERSION = "17.08.2026";

/**
 * Заполните эти поля перед публичным запуском сайта.
 * Значения используются на всех юридических страницах и в подвале сайта.
 */
export const sellerDetails = {
  legalStatus: "", // Например: ИП или ООО
  legalName: "", // Для ИП: ФИО полностью; для ООО: полное фирменное наименование
  inn: "",
  ogrn: "", // ОГРНИП для ИП или ОГРН для ООО
  registrationAuthority: "", // Для ИП: орган, осуществивший государственную регистрацию
  legalAddress: "", // Обязательно для ООО; для ИП укажите адрес для претензий, если применимо
  postalAddress: "", // Адрес для письменных претензий/корреспонденции
  email: "",
  phone: "",
  website: "", // Например: https://raduyka.ru
  personalDataAddress: "", // Email или почтовый адрес для обращений по персональным данным
};

export function legalValue(value: string) {
  return value.trim() || "____________________________";
}

export function sellerDisplayName() {
  const parts = [sellerDetails.legalStatus.trim(), sellerDetails.legalName.trim()].filter(Boolean);
  return parts.length ? parts.join(" ") : "____________________________";
}
