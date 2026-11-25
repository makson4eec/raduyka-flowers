type BlockField = { label: string; text: string; multiline?: boolean };

const field = (label: string, text: string, multiline = false): BlockField => ({ label, text, multiline });

export const infoBlockSections = {
  "blocks-home": {
    label: "Главная — информационные блоки",
    fields: {
      heroEyebrow: field("Главный экран · надзаголовок", "Цветы для важных моментов"),
      heroTitle: field("Главный экран · заголовок", "Букеты, которые\nговорят за вас", true),
      heroText: field("Главный экран · описание", "Соберём авторский букет и согласуем доступные условия и время доставки до оплаты.", true),
      deliveryTitle: field("Условия · доставка", "Доставка по согласованию"),
      deliveryText: field("Условия · текст о доставке", "Стоимость и доступное время подтверждаем до оплаты", true),
      bonusTitle: field("Условия · бонусная программа", "Бонусная программа"),
      bonusText: field("Условия · текст о бонусах", "Условия начисления и списания опубликованы на сайте", true),
      changesTitle: field("Условия · согласование изменений", "Согласуем заметные изменения"),
      changesText: field("Условия · текст об изменениях", "Живые цветы могут отличаться оттенком и степенью раскрытия", true),
    },
  },
  "blocks-delivery": {
    label: "Доставка — тарифы, самовывоз и вопросы",
    fields: {
      eyebrow: field("Надзаголовок", "Бережно и по адресу"),
      title: field("Заголовок", "Доставка через Яндекс"),
      intro: field("Описание доставки", "Заказ передаём в Яндекс Доставку. Стоимость зависит от адреса и подтверждается до оплаты.", true),
      carrier: field("Служба доставки", "Яндекс"),
      tariffTitle: field("Стоимость · заголовок", "По тарифу сервиса"),
      tariffNote: field("Стоимость · короткое условие", "После адреса"),
      tariffText: field("Стоимость · описание", "Яндекс Доставка рассчитает стоимость после проверки указанного адреса.", true),
      confirmationTitle: field("Согласование · заголовок", "Согласуем заранее"),
      confirmationNote: field("Согласование · короткое условие", "До оплаты"),
      confirmationText: field("Согласование · описание", "Сообщим итоговую стоимость доставки вместе с подтверждением заказа.", true),
      pickupTitle: field("Самовывоз · заголовок", "Самовывоз"),
      pickupNote: field("Самовывоз · короткое условие", "Бесплатно"),
      pickupText: field("Самовывоз · текст после адреса", "Сообщим, когда заказ будет готов.", true),
      studioEyebrow: field("Контакты · надзаголовок", "Самовывоз и контакты"),
      studioTitle: field("Контакты · заголовок", "Наша студия"),
      stepsEyebrow: field("Порядок заказа · надзаголовок", "Как всё происходит"),
      stepsTitle: field("Порядок заказа · заголовок", "От оформления до передачи заказа"),
      step1Title: field("Шаг 1 · заголовок", "Вы оформляете заказ"),
      step1Text: field("Шаг 1 · описание", "Указываете только необходимые для исполнения заказа данные.", true),
      step2Title: field("Шаг 2 · заголовок", "Сотрудник подтверждает условия"),
      step2Text: field("Шаг 2 · описание", "Проверяет состав, наличие и, при доставке, сообщает её стоимость до оплаты.", true),
      step3Title: field("Шаг 3 · заголовок", "Заказ передаётся получателю"),
      step3Text: field("Шаг 3 · описание", "После подтверждения и оплаты заказ передаётся выбранным способом.", true),
      faqTitle: field("Вопросы · заголовок", "Частые вопросы"),
      faq1Question: field("Вопрос 1", "Можно доставить, если я не знаю точный адрес?"),
      faq1Answer: field("Ответ 1", "Да. Укажите телефон — мы аккуратно уточним удобное место и время, не раскрывая сюрприз.", true),
      faq2Question: field("Вопрос 2", "Получатель увидит стоимость?"),
      faq2Answer: field("Ответ 2", "Менеджер свяжется с вами и согласует следующий шаг. Все детали заказа остаются у отправителя.", true),
      faq3Question: field("Вопрос 3", "Что будет, если получателя нет на месте?"),
      faq3Answer: field("Ответ 3", "Менеджер свяжется с вами и согласует следующий шаг. Все детали заказа остаются у отправителя.", true),
    },
  },
  "blocks-about": {
    label: "О нас — информационные блоки",
    fields: {
      eyebrow: field("Надзаголовок", "Радость — в живых деталях"),
      title: field("Заголовок", "Не копируем букеты.\nСобираем эмоции.", true),
      intro: field("О студии", "«Радуйка» — цветочная студия, где современная флористика встречается с человеческой заботой. Каждый заказ собираем вручную в день доставки.", true),
      value1Title: field("Карточка 1 · заголовок", "Живые цветы"),
      value1Text: field("Карточка 1 · описание", "Оттенок, размер и степень раскрытия бутонов естественно различаются. Это учитываем при сборке.", true),
      value2Title: field("Карточка 2 · заголовок", "Сохраняем характер"),
      value2Text: field("Карточка 2 · описание", "При допустимых природных отличиях ориентируемся на выбранную палитру, объём и общий образ букета.", true),
      value3Title: field("Карточка 3 · заголовок", "Согласуем существенное"),
      value3Text: field("Карточка 3 · описание", "Заметные замены состава или изменение стоимости подтверждаем с покупателем до оплаты или передачи заказа.", true),
      teamNumber: field("Команда · численность", "12"),
      teamEyebrow: field("Команда · подпись", "Флористов и курьеров"),
      teamTitle: field("Команда · заголовок", "Одна команда, которая отвечает за результат"),
      teamText: field("Команда · описание", "От первого сообщения до вручения букета у заказа есть конкретные люди, а не безымянный конвейер.", true),
    },
  },
  "blocks-occasion": {
    label: "Поводы — информационные блоки",
    fields: {
      eyebrow: field("Надзаголовок", "Когда важны правильные слова"),
      title: field("Заголовок", "Выберите повод —\nмы подберём настроение", true),
      intro: field("Вступление", "Подсказки флористов для тех случаев, когда хочется порадовать, но сложно решить как.", true),
      occasion1Title: field("Повод 1 · заголовок", "День рождения"),
      occasion1Text: field("Повод 1 · описание", "Ярко, празднично и с вау-эффектом", true),
      occasion2Title: field("Повод 2 · заголовок", "Для любимого человека"),
      occasion2Text: field("Повод 2 · описание", "Тепло, лично и без лишней слащавости", true),
      occasion3Title: field("Повод 3 · заголовок", "Спасибо"),
      occasion3Text: field("Повод 3 · описание", "Лёгкий знак внимания, который запомнят", true),
      occasion4Title: field("Повод 4 · заголовок", "Важное событие"),
      occasion4Text: field("Повод 4 · описание", "Сдержанно, благородно и торжественно", true),
      occasion5Title: field("Повод 5 · заголовок", "Просто так"),
      occasion5Text: field("Повод 5 · описание", "Потому что лучший повод — его отсутствие", true),
      occasion6Title: field("Повод 6 · заголовок", "Не знаю, что выбрать"),
      occasion6Text: field("Повод 6 · описание", "Ответьте на один вопрос — поможем", true),
      reminderEyebrow: field("Напоминания · надзаголовок", "Больше не забывать"),
      reminderTitle: field("Напоминания · заголовок", "Напомним о важных датах"),
      reminderText: field("Напоминания · описание", "Сохраняйте события в личном кабинете и получайте напоминания заранее.", true),
    },
  },
};

export type InfoBlockSectionId = keyof typeof infoBlockSections;
export type InfoBlockValues = Record<string, string>;

export function isInfoBlockSection(id: string): id is InfoBlockSectionId {
  return Object.hasOwn(infoBlockSections, id);
}

export function getInfoBlockValues<Id extends InfoBlockSectionId>(id: Id, overrides?: InfoBlockValues) {
  return Object.fromEntries(Object.entries(infoBlockSections[id].fields).map(([key, field]) => [
    key, typeof overrides?.[key] === "string" ? overrides[key] : field.text,
  ])) as Record<keyof typeof infoBlockSections[Id]["fields"], string>;
}

export function parseInfoBlockValues(id: InfoBlockSectionId, value: unknown): InfoBlockValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Заполните поля раздела.");
  const input = value as Record<string, unknown>;
  const fields: Record<string, BlockField> = infoBlockSections[id].fields;
  return Object.fromEntries(Object.entries(input).map(([key, text]) => {
    const field = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (!field || typeof text !== "string" || text.length > (field.multiline ? 4000 : 240)) {
      throw new Error("Проверьте длину и формат текстов раздела.");
    }
    return [key, text.trim()];
  }));
}
