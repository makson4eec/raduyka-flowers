-- Добавляет раздел «Цветы» в уже существующий проект Радуйки.
-- Безопасно запускать повторно: повторные позиции по имени не создаются.
begin;

alter table public.products add column if not exists care text not null default '';
alter table public.products drop constraint if exists products_kind_check;
alter table public.products add constraint products_kind_check check (kind in ('catalog', 'flower', 'builder'));

-- Новые цветы создаются СКРЫТЫМИ с технической ценой 1 ₽ и текущей картинкой-заглушкой.
-- Перед публикацией откройте каждый цветок в /admin, загрузите реальную фотографию, укажите цену и нажмите «Показать».
insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза кустовая Мадам Бомбастик', 'Пышная кустовая роза с множеством плотных бутонов на одной ветке. Даёт букету мягкий объём и выразительную садовую фактуру.', 'Поставьте цветы в чистую вазу с прохладной водой. Удалите листья ниже уровня воды. Подрежьте стебли под углом и регулярно обновляйте срез. Держите вдали от батарей, прямого солнца и фруктов.', 1, '/images/hero-bouquet.png', 'today', 'M', 'pink', 'flower', false, false, 210
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза кустовая Мадам Бомбастик');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза кустовая София', 'Аккуратная кустовая роза с несколькими бутонами на ветке. Хорошо смотрится в лёгких смешанных букетах и добавляет им объём.', 'Используйте чистую вазу и прохладную воду. Уберите листья ниже уровня воды. Обновляйте срез каждые 1–2 дня и не ставьте цветы рядом с отоплением или под прямое солнце.', 1, '/images/hero-bouquet.png', 'today', 'M', 'pink', 'flower', false, false, 220
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза кустовая София');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза кустовая Мисс Бомбастик', 'Кустовая роза с округлыми многолепестковыми бутонами. Подходит для романтичных композиций и нежных авторских букетов.', 'Поставьте в чистую прохладную воду, удалив нижние листья. Подрежьте стебли под углом и меняйте воду ежедневно или через день. Избегайте жары и прямого солнца.', 1, '/images/hero-bouquet.png', 'today', 'M', 'pink', 'flower', false, false, 230
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза кустовая Мисс Бомбастик');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза кустовая Мисти Баблс', 'Пышная кустовая роза с розеточной формой цветка. Добавляет композиции плотность, фактуру и заметный цветочный акцент.', 'Используйте чистую вазу с прохладной водой. Обновляйте срез под углом, не допускайте листьев в воде и держите цветы в прохладном месте без сквозняков и прямого солнца.', 1, '/images/hero-bouquet.png', 'today', 'M', 'pink', 'flower', false, false, 240
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза кустовая Мисти Баблс');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза Эксплоуэр', 'Одноголовая роза с крупным классическим бутоном и строгим силуэтом. Подходит как для монобукетов, так и для выразительных композиций.', 'Подрежьте стебель на 1–2 см под углом, удалите листья ниже уровня воды и поставьте в прохладную чистую воду. Меняйте воду каждый день или через день. Держите вдали от батарей и фруктов.', 1, '/images/hero-bouquet.png', 'today', 'M', 'bright', 'flower', false, false, 250
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза Эксплоуэр');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза Мондиаль', 'Крупная роза с вытянутым бутоном и плавным раскрытием. Хорошо работает в светлых, спокойных и торжественных композициях.', 'Обновите срез под углом и поставьте розу в чистую прохладную воду. Удалите нижние листья, меняйте воду регулярно и держите вазу вдали от прямого солнца и источников тепла.', 1, '/images/hero-bouquet.png', 'today', 'M', 'white', 'flower', false, false, 260
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза Мондиаль');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза Мандала', 'Роза с плотной укладкой лепестков и выразительным центром. Даёт букету собранную форму и хорошо выглядит как самостоятельный акцент.', 'Используйте чистую вазу, прохладную воду и свежий косой срез. Удалите листья ниже воды и обновляйте срез каждые 1–2 дня. Не ставьте рядом с батареями и фруктами.', 1, '/images/hero-bouquet.png', 'today', 'M', 'pink', 'flower', false, false, 270
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза Мандала');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза Кондилайт', 'Роза с крупным бутоном и мягким раскрытием. Подходит для монобукетов и для сочетаний с более воздушными цветами.', 'Поставьте в чистую прохладную воду после свежего косого среза. Удалите листья ниже уровня воды, регулярно меняйте воду и держите цветы в прохладе.', 1, '/images/hero-bouquet.png', 'today', 'M', 'bright', 'flower', false, false, 280
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза Кондилайт');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Роза Фуль Мунди', 'Классическая роза с аккуратной формой бутона. Универсальна для повседневных и праздничных букетов.', 'Обновите срез на 1–2 см под углом, уберите нижние листья и поставьте в чистую прохладную воду. Меняйте воду каждый день или через день и избегайте прямого солнца.', 1, '/images/hero-bouquet.png', 'today', 'M', 'white', 'flower', false, false, 290
where not exists (select 1 from public.products where kind = 'flower' and name = 'Роза Фуль Мунди');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Хризантема кустовая Алтай', 'Ветвистая хризантема с несколькими соцветиями на одном стебле. Делает букет объёмнее и хорошо заполняет композицию.', 'Удалите нижние листья и поставьте хризантему в чистую вазу с прохладной водой. Обновляйте срез и меняйте воду раз в 1–2 дня. Лучше хранить в прохладном месте без прямого солнца.', 1, '/images/hero-bouquet.png', 'today', 'M', 'white', 'flower', false, false, 300
where not exists (select 1 from public.products where kind = 'flower' and name = 'Хризантема кустовая Алтай');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Хризантема кустовая Бакарди', 'Лёгкая кустовая хризантема с открытой формой соцветий. Подходит для воздушных букетов и сочетаний с розами, эустомой и зеленью.', 'Удалите нижние листья, обновите срез и поставьте в прохладную чистую воду. Меняйте воду раз в 1–2 дня и не держите возле батарей или на солнце.', 1, '/images/hero-bouquet.png', 'today', 'M', 'white', 'flower', false, false, 310
where not exists (select 1 from public.products where kind = 'flower' and name = 'Хризантема кустовая Бакарди');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Хризантема кустовая Балтика', 'Пышная кустовая хризантема, которая добавляет букету объём и мягкую округлую форму. Хорошо смотрится в крупных композициях.', 'Поставьте в чистую прохладную воду после обновления среза. Удалите листья ниже воды, меняйте воду раз в 1–2 дня и держите букет в прохладе.', 1, '/images/hero-bouquet.png', 'today', 'M', 'white', 'flower', false, false, 320
where not exists (select 1 from public.products where kind = 'flower' and name = 'Хризантема кустовая Балтика');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Гербера', 'Крупный открытый цветок с графичной формой и заметным центром. Гербера делает букет ярче и добавляет ему современный характер.', 'Налейте в чистую вазу немного прохладной воды — примерно 3–5 см. Меняйте воду каждый день и при необходимости обновляйте срез. Не ставьте герберы под прямое солнце и рядом с источниками тепла.', 1, '/images/hero-bouquet.png', 'today', 'M', 'bright', 'flower', false, false, 330
where not exists (select 1 from public.products where kind = 'flower' and name = 'Гербера');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Эустома', 'Нежный ветвистый цветок с бутонами разной степени раскрытия. Делает композицию лёгкой, естественной и многослойной.', 'Удалите листья ниже уровня воды и поставьте цветы в чистую прохладную воду. Обновляйте срез и меняйте воду каждый день или через день. Берегите от жары и сильных сквозняков.', 1, '/images/hero-bouquet.png', 'today', 'M', 'white', 'flower', false, false, 340
where not exists (select 1 from public.products where kind = 'flower' and name = 'Эустома');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order)
select 'Гортензия', 'Объёмное соцветие, которое может стать главным акцентом букета даже в одном экземпляре. Создаёт пышную и воздушную форму.', 'Гортензия любит воду: используйте чистую вазу и следите, чтобы воды было достаточно. Перед постановкой обновите срез и удалите листья ниже уровня воды. Держите цветок в прохладе.', 1, '/images/hero-bouquet.png', 'today', 'M', 'bright', 'flower', false, false, 350
where not exists (select 1 from public.products where kind = 'flower' and name = 'Гортензия');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order, variants)
select 'Лилия', 'Крупный выразительный цветок с длинными бутонами и эффектным раскрытием. Подходит для высоких букетов и торжественных композиций.', 'Поставьте лилии в высокую чистую вазу и удалите листья ниже уровня воды. Меняйте воду и обновляйте срез каждые 1–2 дня. После раскрытия можно аккуратно удалить пыльники.', 1, '/images/lily-white.png', 'today', 'M', 'white', 'flower', false, false, 360,
  '[{"id":"white","label":"Белая","image":"/images/lily-white.png","price":1},{"id":"pink","label":"Розовая","image":"/images/lily-pink.png","price":1}]'::jsonb
where not exists (select 1 from public.products where kind = 'flower' and lower(name) like '%лили%');

insert into public.products (name, subtitle, care, price, image, stock, size, palette, kind, visible, featured, sort_order, variants)
select 'Гипсофила', 'Воздушные мелкие цветы на тонких разветвлённых стеблях. Гипсофила добавляет композиции лёгкость, объём и нежную фактуру.', 'Подрежьте стебли и поставьте гипсофилу в чистую прохладную воду. Меняйте воду раз в 1–2 дня и держите букет вдали от сильного тепла. Не сжимайте веточки слишком плотно.', 1, '/images/gypsophila-rainbow.png', 'today', 'M', 'bright', 'flower', false, false, 370,
  '[{"id":"rainbow","label":"Радужная","image":"/images/gypsophila-rainbow.png","price":1},{"id":"white","label":"Белая","image":"/images/gypsophila-white.png","price":1}]'::jsonb
where not exists (select 1 from public.products where kind = 'flower' and lower(name) like '%гипсофил%');

commit;
