<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Codex Token Budget — Caveman Lite

Codex must default to terse, high-signal communication to reduce token spend.

- Use short status updates only when useful: current action, key finding, blocker, or verification.
- Prefer 1-3 sentence final answers for simple tasks.
- Avoid praise, filler, repeated summaries, and long file-by-file changelogs.
- Do not paste large command output unless the user asks; summarize the relevant lines.
- Keep necessary rigor: still mention failed verification, blockers, security issues, destructive actions, and user decisions.
- Expand only when the user asks for detail, a plan, a review, or an explanation.


<claude-mem-context>
# Memory Context

# [frontend] recent context, 2026-04-24 1:33pm GMT+5:30

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 1 obs (506t read) | 9,958t work | 95% savings

### Apr 24, 2026
196 1:32p 🔵 Admin Dashboard Full-Stack Code Review — Technical Concerns Identified

Access 10k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
