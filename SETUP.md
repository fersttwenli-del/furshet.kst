# Запуск

## Локально
1. `pnpm install`
2. `pnpm tenant:validate graphite`, затем `pnpm dev` (перед стартом собирается `public/tenants/`).
3. Скопируйте `.env.example` в `.env.local` и заполните `VITE_SUPABASE_*`.

## Supabase
1. SQL Editor, по порядку: `supabase/migrations/0001_core.sql`, `0002_slots_my_booking.sql`, `0003_owner_limits.sql`.
2. Сид студии: `pnpm tenant:sql graphite`, затем выполнить `supabase/seed/graphite.sql`. Повторный запуск обновляет настройки и цены, записи не трогает.
3. Владелец: Authentication → Users → Add user (почта + пароль, публичной регистрации нет; отключите «Allow new users to sign up»). Затем в SQL:
   `insert into tenant_members(tenant_id,user_id) select t.id,u.id from tenants t, auth.users u where t.slug='graphite' and u.email='owner@example.com';`
4. Помощник: `supabase functions deploy assistant`, затем
   `supabase secrets set LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=... LLM_DAILY_TOKEN_CAP=200000`.
5. Без ключей LLM помощник отвечает «недоступен», запись работает.

## Vercel
Подключите репозиторий, команды по умолчанию (`pnpm build`), задайте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`. `vercel.json` уже перенаправляет `/s/<slug>/…` на оболочку.

## Новая студия
`pnpm tenant:new my-studio` → правка `tenants/my-studio/business.json`, картинки в `images/` (logo, hero, work*, icon-192.png, icon-512.png) → `pnpm tenant:validate my-studio` → `pnpm tenant:sql my-studio` → выполнить SQL → деплой. Ссылка: `/s/my-studio/`.
Пока `"demo": true`, студия в статусе preview. Для боевой студии уберите demo, положите реальные картинки и снова выполните `tenant:validate`.

## Меню кейтеринга (обновление)

1. Примените миграцию `supabase/migrations/0010_menu_management.sql` к существующему проекту Supabase.
2. Выполните обновлённый seed `supabase/seed/graphite.sql` в SQL Editor, чтобы заполнить категории и связать с ними блюда. Seed можно запускать повторно.
3. В Supabase Storage проверьте наличие публичного bucket `tenant-media` и разрешений на загрузку для авторизованных владельцев проекта.
4. В кабинете откройте вкладку «Услуги»: здесь теперь редактируются категории и блюда, их активность, описания и фотографии.
5. Для локального запуска используйте `.env.example` как шаблон, заполните `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` своими публичными настройками и сохраните копию как `.env.local`. Не помещайте токены Telegram и другие секреты в `VITE_*` или в репозиторий.

Оформление заказа использует активное меню из базы. В записи сохраняются формат заказа, адрес, число гостей, аллергии, выбранное меню и итоговая сумма. Фотографии категорий и блюд загружаются через вкладку «Услуги».
