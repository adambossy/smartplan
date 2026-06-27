# SmartPlan rebuild — progress

Implements the plan in `../smartplan-annotation-rebuild/`: SmartPlan rebuilt as a React+Vite app
with ContextBridge-style annotation + agent handoff, on a tree-first sliceable source model.

## Run it

```bash
cd app
bun install
bun run --cwd packages/ui build                       # build the single-file review UI
bun run packages/cli/src/index.ts serve ../smartplan-categorizer-eval-pipeline
# open the printed http://127.0.0.1:<port>/ , annotate, click Approve / Incorporate
```

`compile` alone (writes the payload the Vite dev server reads):

```bash
bun run packages/cli/src/index.ts compile ../smartplan-categorizer-eval-pipeline
bun run --cwd packages/ui dev
```

## Built & verified working (browser-tested)

- **packages/shared** — zod schemas. Anchor schema lifted from ContextBridge; subject union extended
  to `plan` / `page{pageId}` / `annotation{pageId, anchor}`. Plan/manifest + CompiledPlan types.
- **packages/anchor** — lifted verbatim from ContextBridge: `selectableTextIndex`, `textMath`,
  `codeTokenSnap`. Framework-agnostic; keys off the DOM data-attribute contract.
- **packages/compiler** — keystone. `plan-src/<id>.md` (frontmatter + `## id — title` sections) +
  `manifest.json` → `CompiledPlan`. Bakes the anchor contract into rendered HTML:
  `data-target-kind`/`data-target-key` (annotatable targets) and `data-src-start-line`/`-end-line`
  (1-indexed lines into the .md, for source slices).
- **packages/ui** — React+Vite single-file app: sidebar tree (read-state dots + live comment-count
  badges + "X / Y sections read"), page view (breadcrumbs, requirements, sections w/ read checkboxes,
  Mermaid), right gutter with inline anchored comments (CSS Custom Highlight API), page + plan
  feedback drawers (collapsible), submit bar (Approve / Incorporate).
- **packages/server** — ephemeral blocking `Bun.serve` on 127.0.0.1:0; routes `/`, `/payload`,
  `/submit`; the `setTimeout(0)` + 204 flush-before-stop fix lifted from ContextBridge.
- **packages/cli** — `compile` and `serve` commands.

Verified in Chromium: select text → composer → save → highlight + gutter card + sidebar badge → click
Incorporate → CLI prints the structured `AnnotationSubmission` (status, thread, anchor with sourceLines/
quote/position/endpoints/target). Screenshot: `smartplan-review.png`.

## Agent loop — built & verified

- **packages/critique** — Handlebars critique compiler. `formatAgentResponse(plan, submission)`
  groups feedback by page in tree order: plan-level threads → General feedback; each page with
  feedback → a Page section (source-file path + page-level notes) containing per-annotation
  subsections, each with the source slice cut from THAT page's markdown + the highlighted-text
  focus. Templates lifted from ContextBridge + the new `pageFeedbackSection.hbs`. `approved` →
  approved message.
- **ExitPlanMode hook** — `smartplan hook claude` reads the PermissionRequest on stdin, reviews the
  tree at `$SMARTPLAN_PLAN_DIR`, blocks on the browser, and emits a ClaudeHookResponse on stdout:
  approve → `allow` + `setMode acceptEdits`; incorporate → `deny` + the compiled critique. Verified
  both paths end-to-end (stdin → submit → stdout). Wiring in `harness/claude/`.
- **serve** now prints the compiled critique on submit, so the loop is visible without the hook.

## Not yet built

- **Update loop automation**: the agent editing `plan-src/*.md` from the critique → recompile →
  re-review is manual today (the critique tells it which files/lines). No auto-apply.
- Build/dist polish (compiled binary, embedded UI), subtree slicing CLI (extract/graft), unit tests.

## Known rough edges

- Anchor `quote.prefix` can include adjacent section-header text ("The goalRead") because the section
  header lives inside the annotatable container. Cosmetic; sourceLines are correct. Worth excluding
  headers/checkbox labels from the index container later.
- UI bundle is ~3.8MB (Mermaid dominates). Lazy-load or trim later.
