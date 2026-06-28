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

# Claude Code integration for local dev

The same `ExitPlanMode` mechanism, wired so your changes are picked up live as you develop.

## Why it's live

The hook runs the CLI straight from TypeScript source via Bun
(`bun run …/packages/cli/src/index.ts hook claude`), so every change to the **cli, server,
compiler, and critique** packages takes effect on the next `ExitPlanMode` — no build step.

The one built artifact is the React review UI (`packages/ui/dist/index.html`), which the server
reads at start. Keep it fresh with a watch build:

```bash
cd app && bun run watch-ui      # rebuilds dist/index.html on every save
```

(For a fast UI-only inner loop with HMR, use `bun run compile-plan <plan-dir>` then `bun run dev`
and edit at http://localhost:5173 — that path doesn't go through the hook.)

## Install the hook

Pick the plan tree to review and register the hook. Easiest is a `settings.json` entry:

```jsonc
// ~/.claude/settings.json  (user scope)  — or  <project>/.claude/settings.json
{
  "env": { "SMARTPLAN_PLAN_DIR": "/abs/path/to/smartplan-<slug>" },
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "ExitPlanMode",
        "hooks": [
          {
            "type": "command",
            "command": "bun run /abs/path/to/app/packages/cli/src/index.ts hook claude",
            "timeout": 345600
          }
        ]
      }
    ]
  }
}
```

`hooks.json` in this directory is the same entry, ready to drop into a Claude Code plugin if you
want full PlanBridge-style packaging later. Restart Claude Code after editing settings.

Optional: put the CLI on your PATH for manual use (`smartplan serve …`, `smartplan check-mermaid …`):

```bash
ln -sf "$PWD/app/bin/smartplan" ~/.local/bin/smartplan
```

## Caveat: which plan gets reviewed

The hook reviews the tree at `$SMARTPLAN_PLAN_DIR` — **not** the markdown plan the agent just
produced in plan mode. So for now this is a dev/review loop against an existing SmartPlan source,
not an automatic "review whatever I just planned." Converting an `ExitPlanMode` plan into a tree on
the fly is a separate, unbuilt feature.
