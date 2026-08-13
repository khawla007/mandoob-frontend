# Action Deck Glass Shine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Action Deck card lift with one reversible broad-glass sweep.

**Architecture:** Use a dedicated `::before` overlay for the glass band while retaining `::after` for the corner pattern. A transform transition moves the band left-to-right on hover/focus and reverses it on hover-out.

**Tech Stack:** React, CSS, Node test runner.

---

### Task 1: Reversible glass hover

**Files:**

- Modify: `src/components/pro/dashboard/ActionDeck.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/pro/dashboard/dashboard-widgets.test.ts`

- [ ] **Step 1: Write the failing structural test**

Assert that Action Deck source omits `hover:-translate-y-0.5`, and CSS defines a broad white `::before` band with a 700ms transform transition, hover/focus translation, and reduced-motion override.

- [ ] **Step 2: Verify red**

Run `npx tsx --test src/components/pro/dashboard/dashboard-widgets.test.ts`. Expected: failure because lift remains and glass CSS is absent.

- [ ] **Step 3: Implement the effect**

Remove the lift utility. Add a stationary `::before` band using `linear-gradient(90deg, transparent, rgb(255 255 255 / 24%), rgb(255 255 255 / 88%), rgb(255 255 255 / 24%), transparent)`, transition its transform for 700ms with `cubic-bezier(0.22, 1, 0.36, 1)`, translate it across on hover/focus, and let the same transition reverse on hover-out. Disable transition under reduced motion.

- [ ] **Step 4: Verify green**

Run focused tests, `npx tsc --noEmit`, Prettier, and `git diff --check`. Expected: all exit zero.
