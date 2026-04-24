# Mandoob — frontend

UAE Business Registration & PRO Management Platform. Next.js 16 + Supabase + Tailwind 4.

See repo-root `CLAUDE.md` and `docs/authentication/step-1-auth-plan.md` for the full architecture.

## Quick start

1. Copy `.env.example` → `.env.local`, paste Supabase URL + anon + service-role keys + Resend API key. See `docs/ops/pending-creds.md` for all required creds.
2. Install + run:

```bash
npm install
npm run dev
```

Visit http://localhost:3000 (public), http://firm.localhost:3000 (tenant), http://admin.localhost:3000 (super admin). Modern browsers resolve `*.localhost` to 127.0.0.1 automatically.

## Seed users (local dev)

Passwords in `docs/ops/seed-creds.md` (gitignored).

| Email                          | Role        | Host                 |
| ------------------------------ | ----------- | -------------------- |
| `khawla@fanaticcoders.com`     | super_admin | admin.localhost:3000 |
| `pro-admin@firm.mandoob.local` | pro         | firm.localhost:3000  |
| `customer@firm.mandoob.local`  | customer    | firm.localhost:3000  |

Re-seed:

```bash
SEED_PASSWORD='<password>' npx tsx --env-file=.env.local scripts/seed-auth.ts
```

## Commands

```bash
npm run dev          # next dev
npm run build        # production build
npm run lint         # eslint
npm run format       # prettier write
npx tsc --noEmit     # typecheck
```

## Supabase required config (post-migration)

- Access Token hook — optional. Migrations keep `auth.users.raw_app_meta_data` in sync via a trigger; hook output is ignored by Supabase on free plan (see `memory/project_supabase_hook_gotcha.md`).
- Auth → Providers → Phone → Twilio (pending creds).
- Auth → Settings → Protection → Leaked password protection ON.

## Project shape (Step 1)

```
src/
├── proxy.ts                  # host resolve + session refresh + CSRF cookie
├── lib/
│   ├── env.ts / env.public.ts
│   ├── supabase/{server,browser,service-role,update-session}.ts
│   ├── tenant/{resolve-host,reserved-subdomains}.ts
│   ├── auth/{require-user,require-role,lockout,mfa,csrf,csrf-guard,turnstile,request}.ts
│   ├── rate-limit/index.ts
│   ├── logging/auth-events.ts
│   ├── validation/auth.ts
│   ├── mail/{client,invite}.ts
│   ├── http/post.ts          # CSRF-aware client fetch
│   └── errors.ts
├── app/
│   ├── (public)/             # platform.com
│   ├── (auth)/               # login/register/mfa/invite on every host
│   ├── (tenant)/t/[tenant]/  # [firm].platform.com (rewritten)
│   ├── admin/                # admin.platform.com (rewritten)
│   └── api/v1/auth/...       # login/register/logout/mfa/invite/webhook
└── components/auth/          # LoginForm, RegisterForm, MfaEnrollCard, ...
```
