# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Toff** is a time-off and overtime management system built with Next.js 15 (App Router), TypeScript, Prisma ORM, and NextAuth.js. It supports employee self-service (submit/view requests) and admin workflows (approve/reject, manage balances, configure email settings).

## Commands

```bash
# Development
npm run dev          # Start dev server with Turbopack

# Build
npm run build        # Generates Prisma client, then builds Next.js

# Testing
npm run test:run     # Run all tests once (CI mode)
npm test             # Run tests in watch mode
npm run test:ui      # Open Vitest UI
npm run test:coverage

# Run a single test file
npx vitest run src/path/to/file.test.ts

# Linting
npm run lint

# Database
npm run seed         # Seed default users into the database
npm run reset-time-off  # Reset time-off data
npx prisma migrate dev   # Apply migrations
npx prisma studio        # Open Prisma data browser
```

## Architecture

### Dual-Database Strategy

The app runs SQLite in development and PostgreSQL in production. The `isPrismaEnabled` flag in `src/lib/db.ts` controls which adapter is used — it's `true` when `DATABASE_URL` starts with `postgres` or when the `VERCEL` env var is set.

- All database access goes through `src/lib/db/adapter.ts` (`DatabaseAdapter`), which abstracts over both backends.
- Multi-step mutations use `src/lib/db/transaction.ts` (`TransactionManager`) to ensure atomicity.
- Never call `prisma.*` directly from API routes — go through the adapter or service layer.

### Request Lifecycle

1. **API Route** validates input with Zod (`src/lib/validators/schemas.ts`) via `validateRequest()` from `src/lib/validators/middleware.ts`.
2. **Service layer** (`src/lib/services/`) or manager classes (`src/lib/balance-manager.ts`, `src/lib/request-manager.ts`) apply business rules.
3. **Mutations** are wrapped in transactions and followed by an audit log entry (`src/lib/audit.ts`).
4. **Email notifications** are fired via `src/lib/email.ts` (Nodemailer; falls back to Ethereal for dev preview links). Email settings can be stored in the DB to override env vars.

### Authentication

NextAuth.js (`src/lib/auth.ts`) is configured with two providers:
- **Credentials** — email + bcryptjs password (standard login form).
- **Email** — magic links sent via the configured SMTP transport.

JWT sessions (30-day TTL). The user's `role` (`ADMIN | MANAGER | EMPLOYEE`) is injected into the JWT in the `jwt` callback and re-exposed on `session.user.role`. API routes and admin pages gate on this value.

### Working Days Calculation

`src/lib/date-utils.ts` is the authoritative source for working-day math. It excludes weekends and a fixed set of US holidays (Thanksgiving, Christmas Eve, Christmas, New Year's Eve, New Year's Day). Working-day counts drive balance deductions — always use these utilities rather than raw date arithmetic.

### Type Conventions

- DB models use `snake_case` field names (Prisma default).
- API responses use `camelCase` (transformed in `src/lib/utils/api-transformers.ts`).
- Shared TypeScript interfaces live in `src/lib/types/api-interfaces.ts`.
- Zod schemas in `src/lib/validators/schemas.ts` are the single source of truth for runtime validation.

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`). Use this alias for all imports within `src/`.

## Key Environment Variables

```
DATABASE_URL        # postgres:// for production; omit for SQLite dev mode
NEXTAUTH_URL        # Public URL of the app
NEXTAUTH_SECRET     # Random secret for JWT signing
EMAIL_SERVER_HOST   # SMTP host (e.g. smtp.gmail.com)
EMAIL_SERVER_PORT   # SMTP port (e.g. 587)
EMAIL_SERVER_USER
EMAIL_SERVER_PASSWORD
EMAIL_FROM          # Sender address
ADMIN_EMAIL         # Receives approval-request notifications
```

## Data Models (Prisma)

| Model | Purpose |
|---|---|
| `User` | Auth + profile; `role` field governs permissions |
| `TimeOffBalance` | Per-user, per-year, per-type balance (totalDays / usedDays / remainingDays) |
| `TimeOffRequest` | Request with status workflow: PENDING → APPROVED / REJECTED |
| `OvertimeRequest` | Overtime hours tracking with same status workflow |
| `AuditLog` | Immutable record of all mutations for compliance |
| `Account`, `Session`, `VerificationToken` | NextAuth.js internal tables |

## Testing

Tests use **Vitest** with jsdom and `@testing-library/react`. Test files live alongside source in `src/` or under `src/test/`. The Vitest config is in `vitest.config.ts`. There is no separate `__tests__` directory convention — co-locate tests with the module they test.
