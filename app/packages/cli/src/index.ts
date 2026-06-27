import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { compilePlan } from '@smartplan/compiler';
import { formatAgentResponse } from '@smartplan/critique';
import { startReviewServer, type SourceEdit } from '@smartplan/server';
import { toClaudeHookResponse } from './claudeHookResponse.ts';
import { extractMermaidBlocks, writeCheckHarness } from './mermaidCheck.ts';

const [command, ...rest] = process.argv.slice(2);

// The built single-file UI lives next to this package, regardless of the caller's cwd.
const UI_HTML_PATH = resolve(import.meta.dir, '../../ui/dist/index.html');

// Persist an inline edit to plan-src/<pageId>.md by splicing the given line range, then recompile
// so the served payload stays in lockstep with the datastore.
function makeEditHandler(srcDir: string) {
  return (edit: SourceEdit) => {
    const mdPath = resolve(srcDir, 'plan-src', `${edit.pageId}.md`);
    const lines = readFileSync(mdPath, 'utf8').split('\n');
    const replacement = edit.text.split('\n');
    const removed = edit.endLine - edit.startLine + 1;
    lines.splice(edit.startLine - 1, removed, ...replacement);
    writeFileSync(mdPath, lines.join('\n'));
    return { lineDelta: replacement.length - removed, plan: compilePlan(srcDir) };
  };
}

function compileCommand(args: string[]): void {
  const srcDir = resolve(args[0] ?? '.');
  const outIndex = args.indexOf('--out');
  const out = resolve(
    outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1]! : 'packages/ui/public/compiled-plan.json',
  );
  const plan = compilePlan(srcDir);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(plan, null, 2));
  console.log(`compiled ${plan.pages.length} pages from ${srcDir}\n→ ${out}`);
}

async function serveCommand(args: string[]): Promise<void> {
  const srcDir = resolve(args[0] ?? '.');
  const plan = compilePlan(srcDir);
  const server = startReviewServer({
    plan,
    html: readFileSync(UI_HTML_PATH, 'utf8'),
    onEditSource: makeEditHandler(srcDir),
  });
  console.log(`SmartPlan review server: ${server.url}`);
  console.log('Open it in your browser. Waiting for you to Approve or Incorporate…');
  openBrowser(server.url);
  const submission = await server.result;
  server.stop();
  console.log('\n===== agent-facing critique =====\n');
  console.log(formatAgentResponse(plan, submission));
  process.exit(0);
}

// Generate a browser harness that renders every Mermaid diagram in the plan. The agent opens it,
// reads window.__mermaidCheck.failed, fixes the offending plan-src/<page>.md, and re-runs until
// failedCount is 0 — before handing control back to the user.
function checkMermaidCommand(args: string[]): void {
  const srcDir = resolve(args[0] ?? '.');
  const blocks = extractMermaidBlocks(srcDir);
  if (blocks.length === 0) {
    console.log('No Mermaid diagrams found.');
    return;
  }
  const harness = writeCheckHarness(srcDir, blocks);
  console.log(`${blocks.length} Mermaid diagram(s) across ${new Set(blocks.map((b) => b.pageId)).size} page(s).`);
  for (const b of blocks) console.log(`  - plan-src/${b.pageId}.md:${b.line}`);

  if (args.includes('--serve')) {
    const html = readFileSync(harness, 'utf8');
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    });
    console.log(`\nHarness server: http://127.0.0.1:${server.port}/`);
    console.log('Open it, read window.__mermaidCheck.failed, fix any failures, and re-run. Ctrl-C when done.');
  } else {
    console.log(`\nHarness: ${harness}`);
    console.log('Serve it (or re-run with --serve) and read window.__mermaidCheck — fix failures and re-run.');
  }
}

// ExitPlanMode hook entrypoint: read the PermissionRequest on stdin, review the SmartPlan at
// SMARTPLAN_PLAN_DIR, and emit a ClaudeHookResponse on stdout (allow / deny + critique).
async function hookClaudeCommand(): Promise<void> {
  await readStdin(); // PermissionRequest payload; the tree under review is configured below.
  const srcEnv = process.env.SMARTPLAN_PLAN_DIR;
  if (!srcEnv) {
    // No SmartPlan configured for this session — let the harness proceed normally.
    process.stdout.write('{}');
    return;
  }
  const srcDir = resolve(srcEnv);
  const plan = compilePlan(srcDir);
  const server = startReviewServer({
    plan,
    html: readFileSync(UI_HTML_PATH, 'utf8'),
    onEditSource: makeEditHandler(srcDir),
  });
  process.stderr.write(`SmartPlan review: ${server.url}\n`);
  openBrowser(server.url);
  const submission = await server.result;
  server.stop();
  process.stdout.write(JSON.stringify(toClaudeHookResponse(plan, submission)));
}

switch (command) {
  case 'compile':
    compileCommand(rest);
    break;
  case 'serve':
    await serveCommand(rest);
    break;
  case 'check-mermaid':
    checkMermaidCommand(rest);
    break;
  case 'hook':
    if (rest[0] === 'claude') await hookClaudeCommand();
    else {
      console.error('usage: smartplan hook claude');
      process.exit(1);
    }
    break;
  default:
    console.error(
      `unknown command: ${command ?? '(none)'}\nusage: smartplan <compile|serve|check-mermaid|hook claude> [srcDir]`,
    );
    process.exit(1);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function openBrowser(url: string): void {
  if (process.env.SMARTPLAN_NO_OPEN) return;
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    Bun.spawn([cmd, url], { stdout: 'ignore', stderr: 'ignore' });
  } catch {
    // non-fatal: the URL is printed for manual opening
  }
}
