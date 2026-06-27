# Claude Code integration

Routes `ExitPlanMode` through SmartPlan review, ContextBridge-style.

## Wire it up

1. Build the UI once: `bun run --cwd app/packages/ui build`.
2. Point the hook at the SmartPlan source tree to review for this session:
   ```bash
   export SMARTPLAN_PLAN_DIR=/abs/path/to/smartplan-<slug>   # dir holding manifest.json + plan-src/
   ```
3. Register `hooks.json` (this directory) with Claude Code as a plugin, or copy its
   `PermissionRequest` entry into your settings.

## Flow

- On `ExitPlanMode`, `smartplan hook claude` reads the PermissionRequest on stdin, compiles the
  tree at `$SMARTPLAN_PLAN_DIR`, serves the review UI (ephemeral `127.0.0.1` server), opens the
  browser, and blocks (up to ~4 days) until you Approve or Incorporate.
- **Approve Plan** → returns `{ decision: { behavior: 'allow', updatedPermissions: [setMode
  acceptEdits] } }` — plan mode exits, implementation proceeds.
- **Incorporate Comments** → returns `{ decision: { behavior: 'deny', message: <critique> } }` —
  the compiled, page-grouped critique (with per-annotation source slices) goes back to the agent,
  which edits `plan-src/<page-id>.md`, recompiles, and resubmits for another review.

If `SMARTPLAN_PLAN_DIR` is unset, the hook emits `{}` and the harness proceeds normally.
