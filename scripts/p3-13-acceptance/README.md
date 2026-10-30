# Reduced local authorization smoke

Run the smoke only against the disposable loopback stack:

```sh
SUPABASE_CLI=/absolute/path/to/supabase \
P2_ACCEPTANCE_LOCAL_ONLY=1 \
P3_13_AUTH_BASE_URL=http://127.0.0.1:3113 \
node --import tsx scripts/p3-13-acceptance/reduced-auth-smoke.ts
```

The private acceptance workdir links every validated SQL migration except
`20260915090000_0087_reconcile_existing_pro_access.sql`. That immutable migration is a
separately verified, production-data recovery operation whose preconditions intentionally reject
an empty database. The exclusion is fixed in code: callers cannot choose another file, the source
file must exist as a regular file, and the ordinary migration directory is never modified.

The runner provisions disposable identities, runs only the reduced English desktop authorization
matrix, then stops the app and local stack and removes credentials, browser sessions, and its
private migration view. It does not run the advanced axe, visual, theme, responsive, or exhaustive
route matrices.

Internally, the runner sets `P3_13_REDUCED_AUTH_FIXTURE=1`. Only that exact value bypasses optional
P2 dashboard-content seeds (cases, document requests, renewals, finance/import samples, and CMS
drafts). Core identities, profiles, verified PRO credential, active Company assignment,
customer/employee linkage, TOTP enrollment, MFA markers, and the owner-only credential manifest
remain mandatory. Ordinary P2 fixture runs do not set this flag and retain their full seed behavior.

The reduced runner also supplies `P3_13_REDUCED_AUTH_SECRET_PATH` pointing to a nested `0700`
directory inside `.p2-12-acceptance-runtime`. The fixture and app reject that override outside
reduced mode, outside the private workdir, or through an unsafe/symlink parent. Default P2 runs
continue to use `tests/.auth/p2-credentials.json`; the tracked `tests/.auth` directory is never
chmodded. Removing the private workdir removes the reduced manifest.

For the production-mode local app only, the runner sets `P3_13_ACCEPTANCE_LOCAL_ONLY=1`. Server
environment validation accepts HTTP only when that exact flag is paired with the exact origin
`http://127.0.0.1:3113`. Other hosts, ports, protocols, flag values, and ordinary production runs
still require HTTPS; the existing P1.12 and P2 exceptions are unchanged.
