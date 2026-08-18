# Радуйка — интернет-магазин цветов

Next.js-приложение магазина «Радуйка»: каталог, конструктор букета, корзина и заказы, админ-панель, личный кабинет, бонусы, важные даты и Web Push-напоминания.

## Что используется

- Next.js 16 / React 19 / TypeScript
- Supabase Auth + Postgres
- Supabase Storage (`product-images`) для фотографий товаров
- Firebase Cloud Messaging для Web Push
- Vercel Cron для ежедневной отправки напоминаний

## Локальный запуск

Требуется Node.js 22+.

```powershell
npm.cmd install
npm.cmd test
npm.cmd run dev
```

Сайт: `http://localhost:3000`  
Админка: `http://localhost:3000/admin`

Перед production-развёртыванием также проверьте:

```powershell
npm.cmd run build
```

## Supabase

Для нового проекта последовательно выполните в SQL Editor:

1. `supabase/schema.sql` — профили, напоминания, push-подписки и журнал уведомлений.
2. `supabase/store.sql` — товары и заказы.

В Supabase Storage создайте публичный bucket:

```text
product-images
```

Рекомендуемые ограничения bucket: изображения JPG/PNG/WebP, до 5 МБ.

Если остался старый локальный `data/store.json`, его можно один раз перенести:

```powershell
npm.cmd run migrate:supabase
```

Рабочее приложение после миграции не зависит от `data/store.json` и не сохраняет загруженные картинки в файловую систему Vercel.

## Переменные окружения

Скопируйте `.env.example` в `.env.local` и заполните значения. Секреты нельзя коммитить в Git.

Критичные server-only переменные:

- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `CRON_SECRET`

Публичные Firebase/Supabase переменные уже имеют префикс `NEXT_PUBLIC_`.

После подключения постоянного домена задайте `SITE_URL=https://ваш-домен` и добавьте этот адрес в Supabase Auth URL Configuration. Для первой Vercel-публикации приложение умеет использовать системный production URL Vercel как безопасный запасной вариант.

## Vercel

1. Подключите GitHub-репозиторий.
2. Импортируйте переменные окружения из `.env.local` в Vercel Environment Variables.
3. Проверьте, что `ADMIN_SESSION_SECRET` и `CRON_SECRET` заполнены случайными значениями.
4. Выполните Deploy.
5. После появления production-адреса проверьте регистрацию, `/admin`, создание заказа, загрузку изображения и push-уведомления.

Cron уже описан в `vercel.json` и вызывает `/api/cron/reminders` ежедневно.

## Безопасность

`.gitignore` исключает `.env*`, Firebase Admin SDK JSON, приватные ключи, локальное хранилище заказов, `node_modules`, `.next` и `.vercel`.

## Юридическая готовность перед публичным запуском

Проект содержит юридические страницы, отдельное согласие на ПД, фиксацию версии оферты и дополнительные поля информации о товаре. Перед запуском обязательно выполните пункты из [`LEGAL_RELEASE_CHECKLIST.md`](./LEGAL_RELEASE_CHECKLIST.md), заполните `lib/legal.ts` и примените миграцию `supabase/migrations/2026-08-17-legal-readiness.sql`.

Подробный список внесённых изменений: [`LEGAL_CHANGELOG.md`](./LEGAL_CHANGELOG.md).
