import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface MermaidBlock {
  id: string;
  pageId: string;
  /** 1-indexed line of the ```mermaid fence in plan-src/<pageId>.md. */
  line: number;
  code: string;
}

// Extract every ```mermaid fenced block across the plan source, tagged with its page + line so a
// failure points the agent straight at the file to fix.
export function extractMermaidBlocks(srcDir: string): MermaidBlock[] {
  const dir = resolve(srcDir, 'plan-src');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const blocks: MermaidBlock[] = [];

  for (const file of files) {
    const pageId = file.replace(/\.md$/, '');
    const lines = readFileSync(join(dir, file), 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (!/^```mermaid\s*$/.test(lines[i]!)) continue;
      const fenceLine = i + 1;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        body.push(lines[i]!);
        i += 1;
      }
      blocks.push({ id: `${pageId}-${fenceLine}`, pageId, line: fenceLine, code: body.join('\n') });
    }
  }
  return blocks;
}

// Write a self-contained harness the agent opens in its browser. It renders every diagram with the
// same Mermaid the app uses and records failures on window.__mermaidCheck for the agent to read.
export function writeCheckHarness(srcDir: string, blocks: MermaidBlock[]): string {
  const outPath = resolve(srcDir, 'mermaid-check.html');
  const data = JSON.stringify(blocks);
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Mermaid check</title>
<style>
  body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 24px; }
  .d { border: 1px solid #ddd; border-radius: 8px; padding: 14px; margin: 12px 0; }
  .d.fail { border-color: #c0392b; background: #fdf0ee; }
  .hd { font: 12px ui-monospace, monospace; color: #666; margin-bottom: 8px; }
  .err { color: #c0392b; font: 12px ui-monospace, monospace; white-space: pre-wrap; }
  #summary { font-weight: 600; margin-bottom: 16px; }
</style></head>
<body>
  <div id="summary">Rendering…</div>
  <div id="out"></div>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
    const blocks = ${data};
    const out = document.getElementById('out');
    const results = [];
    for (const b of blocks) {
      const card = document.createElement('div');
      card.className = 'd';
      const hd = document.createElement('div');
      hd.className = 'hd';
      hd.textContent = 'plan-src/' + b.pageId + '.md : line ' + b.line;
      card.appendChild(hd);
      try {
        await mermaid.parse(b.code);
        const { svg } = await mermaid.render('m_' + b.id.replace(/[^a-zA-Z0-9_]/g, '_'), b.code);
        const box = document.createElement('div');
        box.innerHTML = svg;
        card.appendChild(box);
        results.push({ id: b.id, pageId: b.pageId, line: b.line, ok: true });
      } catch (e) {
        card.className = 'd fail';
        const err = document.createElement('div');
        err.className = 'err';
        err.textContent = String((e && e.message) || e);
        card.appendChild(err);
        results.push({ id: b.id, pageId: b.pageId, line: b.line, ok: false, error: String((e && e.message) || e) });
      }
      out.appendChild(card);
    }
    const failed = results.filter((r) => !r.ok);
    window.__mermaidCheck = { total: blocks.length, failedCount: failed.length, failed, results };
    document.getElementById('summary').textContent =
      blocks.length + ' diagram(s): ' + (blocks.length - failed.length) + ' ok, ' + failed.length + ' failed';
  </script>
</body>
</html>
`;
  writeFileSync(outPath, html);
  return outPath;
}
