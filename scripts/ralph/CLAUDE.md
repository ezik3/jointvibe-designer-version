# Ralph Operating Rules for nocturne-pos

You are working in a sensitive production-style codebase. Follow these rules strictly.

## Core behavior
- Only work on the single active task defined in `scripts/ralph/prd.json`.
- Do not make unrelated improvements, refactors, renames, formatting sweeps, dependency upgrades, or cleanup changes.
- Do not touch files outside the scope of the active task unless absolutely required for the task to function.
- Prefer the smallest safe change that solves the problem.
- Preserve existing UX, styling, copy, and behavior unless the task explicitly allows changes.

## Git safety
- Never push to remote.
- Only create a local commit if:
  - the requested task is completed,
  - checks pass,
  - and the diff is limited to the intended task.
- If the task is incomplete or risky, do not commit.

## Investigation rules
- First diagnose before editing.
- Identify likely root cause with evidence from code.
- Avoid guessing.
- If the issue cannot be fixed confidently, stop and report findings instead of making broad speculative edits.

## Performance rules
- Do not trade correctness for speed.
- Prefer reducing redundant fetches, unnecessary rerenders, oversized payloads, and blocking work on initial render.
- Do not rewrite architecture unless explicitly instructed.

## Allowed output
- Make only narrowly scoped code changes.
- Update `scripts/ralph/progress.txt` with:
  - what was diagnosed,
  - what was changed,
  - what checks were run,
  - any risks or follow-ups.

## Forbidden without explicit task permission
- package/dependency changes
- auth flow changes
- database schema changes
- Supabase migration changes
- broad route rewrites
- changes to unrelated pages
- automatic push to GitHub