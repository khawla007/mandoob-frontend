# Admin Sidebar Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the admin sidebar into CMS-oriented sections and keep Auth & Security limited to identity, security, audit, and privacy tools.

**Architecture:** Keep the existing declarative `adminNav` configuration and sidebar renderer. Test the group order and route membership directly from the exported configuration, then make the smallest configuration and translation changes needed.

**Tech Stack:** TypeScript, React, Next.js, next-intl, Node test runner

---

### Task 1: Lock the hierarchy with configuration tests

**Files:**
- Modify: `src/lib/shell/nav-admin.test.ts`

- [ ] **Step 1: Write failing tests for order and membership**

Import `adminNav`, derive group labels and route lists, then assert this exact order:

```ts
assert.deepEqual(
  adminNav.map((group) => group.labelKey ?? 'overview'),
  ['overview', 'catalog', 'editorial', 'business', 'tenants', 'authSecurity', 'account'],
);

assert.deepEqual(groupHrefs('catalog'), ['/admin/cost-data', '/admin/blog/categories']);
assert.deepEqual(groupHrefs('business'), [
  '/admin/leads',
  '/admin/finance',
  '/admin/whatsapp-templates',
]);
assert.deepEqual(groupHrefs('authSecurity'), [
  '/admin/users',
  '/admin/sessions',
  '/admin/security',
  '/admin/audit-logs',
  '/admin/erasure-requests',
]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --import tsx --test src/lib/shell/nav-admin.test.ts`

Expected: FAIL because `business` and `authSecurity` groups do not exist and the current order differs.

- [ ] **Step 3: Commit the failing test**

```bash
git add src/lib/shell/nav-admin.test.ts
git commit -m "test: define admin sidebar hierarchy"
```

### Task 2: Reorganize the navigation configuration

**Files:**
- Modify: `src/lib/shell/nav-admin.ts`
- Modify: `src/messages/en.json`
- Modify: `src/messages/ar.json`

- [ ] **Step 1: Apply the minimal group reordering**

Keep Overview first. Move Cost data into Catalog before Taxonomies. Keep Blog and Pages in Editorial. Create Business with Leads, Finance, and WhatsApp templates. Keep PRO firms in Tenants. Rename Auth to Auth & Security and leave only Users, Sessions, MFA & Security, Audit logs, and Erasure requests. Keep Account last.

- [ ] **Step 2: Add group translations**

Add `business` and `authSecurity` keys to both `shell` translation objects. Use `Business` and `Auth & Security` in English, with matching Arabic labels.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run: `node --import tsx --test src/lib/shell/nav-admin.test.ts`

Expected: all admin navigation tests PASS.

- [ ] **Step 4: Commit the implementation**

```bash
git add src/lib/shell/nav-admin.ts src/messages/en.json src/messages/ar.json
git commit -m "fix: organize admin sidebar sections"
```

### Task 3: Verify application integrity

**Files:**
- Modify only if verification exposes a directly related defect.

- [ ] **Step 1: Run shell configuration tests**

Run: `node --import tsx --test src/lib/shell/nav-config.test.ts src/lib/shell/nav-admin.test.ts`

Expected: all tests PASS.

- [ ] **Step 2: Run TypeScript compilation**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit code 0; pre-existing warnings may remain.

- [ ] **Step 4: Inspect the admin sidebar**

Run the existing local app and confirm the expanded and collapsed sidebar preserve active states, taxonomy expansion, translations, and route destinations.

- [ ] **Step 5: Commit any directly related verification fix**

If no fix is needed, do not create an empty commit. Otherwise stage only the relevant files and commit with a defect-specific message.

