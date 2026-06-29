# Arbitrage Team CRM MVP

MVP CRM for live handler distribution and manual lead accounting. Leads are never ingested automatically: a handler receives a client directly in Telegram and manually creates the lead in CRM with mandatory `traffic_id` and handler traceability.

## Apps

- `apps/backend` — Express API, PostgreSQL, Prisma, RBAC, audit logging and traffic target selection.
- `apps/bot` — Telegraf bot for login deep links, shift start/end, and Mini App launch.
- `apps/web` — React + Vite Telegram Mini App UI.

## Quick start

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run dev
```

Run migrations from backend:

```bash
npm run migrate -w @crm/backend
```

## Core rules

- Lead creation is only manual by users with `HANDLER` role.
- `traffic_id` is mandatory for every lead.
- Handler shift controls visibility for traffic users.
- Traffic users explicitly select one active handler as their current traffic target; this selection is audited.
- Traffic users never see leads, only active handlers and their own aggregated stats.
- Every auditable action is stored in `AuditLog`.
