# Arbitrage Team CRM MVP

MVP CRM for live handler distribution and manual lead accounting. Leads are never ingested automatically: a handler receives a client directly in Telegram and manually creates the lead in CRM with mandatory `traffic_id` and handler traceability.

## Apps

- `apps/backend` — Express API, PostgreSQL, Prisma, RBAC, registration requests, audit logging and traffic target selection.
- `apps/bot` — Telegraf bot that opens the Telegram Mini App.
- `apps/web` — React + Vite Telegram Mini App UI.

## Where to put bot token and admin IDs

Copy `.env.example` to `.env` in the repository root and edit these values:

```bash
BOT_TOKEN=123456:telegram_bot_token_from_BotFather
ADMIN_TELEGRAM_IDS=111111111,222222222
WEB_APP_URL=http://localhost:5173
API_BASE_URL=http://localhost:4000
```

`ADMIN_TELEGRAM_IDS` is a comma-separated list of Telegram numeric user IDs. These users are auto-approved as `ADMIN` on first Mini App open.

## Local PyCharm run without deployment

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start PostgreSQL locally and create database `arbitrage_crm`.
3. Apply Prisma migration:
   ```bash
   npm run migrate -w @crm/backend
   ```
4. Create three PyCharm npm run configurations:
   - Backend: `npm run dev -w @crm/backend`
   - Web Mini App: `npm run dev -w @crm/web`
   - Bot: `npm run dev -w @crm/bot`
5. Start Backend, then Web, then Bot.
6. Open your Telegram bot and press **Открыть CRM Mini App**.

For real Telegram Mini Apps, Telegram normally requires an HTTPS URL. For local testing you can open `http://localhost:5173` directly in a browser or expose Vite with a tunnel and put that HTTPS URL into `WEB_APP_URL`.

## Registration flow

1. User opens the bot and presses **Открыть CRM Mini App**.
2. Mini App calls `POST /auth/telegram` and checks whether the Telegram user exists and is approved.
3. If approved, API returns JWT and the Mini App opens the role dashboard: admin, traffic or handler.
4. If not approved, Mini App shows **Зарегистрироваться**.
5. After pressing it, `POST /auth/register-request` creates/updates the user as `PENDING`, shows “Вы подали заявку на регистрацию. Подождите, с вами свяжутся.” and notifies all admin IDs from `.env`.
6. Admin opens their dashboard, sees pending users, assigns role and optional `traffic_id`.
7. User reopens Mini App and receives their assigned dashboard.

## Core rules

- Lead creation is only manual by users with `HANDLER` role.
- `traffic_id` is mandatory for every lead.
- Handler shift controls visibility for traffic users.
- Traffic users explicitly select one active handler as their current traffic target; this selection is audited.
- Traffic users never see leads, only active handlers and their own aggregated stats.
- Every auditable action is stored in `AuditLog`.
