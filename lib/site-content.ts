import { sellerDetails } from "./legal";

export type SiteSettings = typeof sellerDetails & {
  address: string;
  hoursWeekdays: string;
  hoursWeekend: string;
  mapLink: string;
  mapEmbedUrl: string;
};
export type InfoPage = { title: string; body: string; version?: string };
export type SiteContent = { settings: SiteSettings; pages: Record<string, InfoPage>; settingsVersion?: string };
export const defaultSettings: SiteSettings = {
  ...sellerDetails,
  address: "Екатеринбург, ул. Библиотечная, 43",
  hoursWeekdays: "Пн–Пт: 09:00–21:00",
  hoursWeekend: "Сб–Вс: 10:00–21:00",
  mapLink: "https://yandex.ru/maps/-/CTSgV45D",
  mapEmbedUrl: "https://yandex.ru/map-widget/v1/?ll=60.659323%2C56.833035&mode=search&oid=200831341309&ol=biz&z=17",
};
