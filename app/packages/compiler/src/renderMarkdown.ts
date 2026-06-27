import { marked } from 'marked';

// Block-level markdown renderer that bakes in the anchor DOM contract:
//   - data-target-kind / data-target-key  → makes a block an annotatable target
//   - data-src-start-line / data-src-end-line → 1-indexed lines into the .md file,
//     so a selection's anchor carries an accurate source range back to the agent.
// Inline formatting (bold/em/code/links) is delegated to marked.parseInline.

export interface RenderLine {
  /** 1-indexed absolute line number in the source .md file. */
  n: number;
  text: string;
}

interface DataAttrs {
  kind?: string;
  key?: string;
  start: number;
  end: number;
}

function attrs(a: DataAttrs): string {
  const parts: string[] = [];
  if (a.kind) parts.push(`data-target-kind="${a.kind}"`);
  if (a.key) parts.push(`data-target-key="${a.key}"`);
  parts.push(`data-src-start-line="${a.start}"`, `data-src-end-line="${a.end}"`);
  return parts.join(' ');
}

function inline(md: string): string {
  return marked.parseInline(md.trim()) as string;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const FENCE = /^(```|~~~)(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const UL_ITEM = /^[-*]\s+(.*)$/;
const OL_ITEM = /^\d+\.\s+(.*)$/;
const BLOCKQUOTE = /^>\s?(.*)$/;
const TABLE_ROW = /^\|(.*)\|\s*$/;
const TABLE_SEP = /^\|[\s:|-]+\|\s*$/;

/** Render a list of source lines (each tagged with its absolute line number) to HTML. */
export function renderBlocks(lines: RenderLine[]): string {
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const raw = line.text;

    if (raw.trim() === '') {
      i += 1;
      continue;
    }

    // Fenced code / mermaid
    const fence = raw.match(FENCE);
    if (fence) {
      const lang = fence[2]!.trim();
      const start = line.n;
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.text.match(FENCE)) {
        body.push(lines[i]!.text);
        i += 1;
      }
      const end = i < lines.length ? lines[i]!.n : lines[lines.length - 1]!.n;
      i += 1; // consume closing fence
      if (lang === 'mermaid') {
        out.push(`<div class="mermaid" ${attrs({ start, end })}>${escapeHtml(body.join('\n'))}</div>`);
      } else {
        const cls = lang ? ` class="language-${lang}"` : '';
        out.push(
          `<pre ${attrs({ start, end })}><code${cls} ${attrs({ kind: 'code-block', key: 'code', start, end })}>${escapeHtml(
            body.join('\n'),
          )}</code></pre>`,
        );
      }
      continue;
    }

    // Heading (### within a section)
    const heading = raw.match(HEADING);
    if (heading) {
      const level = Math.min(heading[1]!.length, 6);
      out.push(`<h${level} ${attrs({ kind: 'block', key: `h${level}`, start: line.n, end: line.n })}>${inline(heading[2]!)}</h${level}>`);
      i += 1;
      continue;
    }

    // Table
    if (TABLE_ROW.test(raw)) {
      const rows: RenderLine[] = [];
      while (i < lines.length && TABLE_ROW.test(lines[i]!.text)) {
        rows.push(lines[i]!);
        i += 1;
      }
      out.push(renderTable(rows));
      continue;
    }

    // Blockquote
    if (BLOCKQUOTE.test(raw)) {
      const start = line.n;
      const inner: string[] = [];
      let end = line.n;
      while (i < lines.length && BLOCKQUOTE.test(lines[i]!.text)) {
        inner.push(lines[i]!.text.replace(BLOCKQUOTE, '$1'));
        end = lines[i]!.n;
        i += 1;
      }
      out.push(`<blockquote ${attrs({ kind: 'block', key: 'blockquote', start, end })}>${inline(inner.join(' '))}</blockquote>`);
      continue;
    }

    // Lists
    if (UL_ITEM.test(raw) || OL_ITEM.test(raw)) {
      const ordered = OL_ITEM.test(raw);
      const tag = ordered ? 'ol' : 'ul';
      const itemRe = ordered ? OL_ITEM : UL_ITEM;
      const start = line.n;
      const items: string[] = [];
      let end = line.n;
      while (i < lines.length && (UL_ITEM.test(lines[i]!.text) || OL_ITEM.test(lines[i]!.text))) {
        const li = lines[i]!;
        const m = li.text.match(itemRe) ?? li.text.match(UL_ITEM) ?? li.text.match(OL_ITEM);
        const content = m ? m[1]! : li.text;
        items.push(`<li ${attrs({ kind: 'list-item', key: 'li', start: li.n, end: li.n })}>${inline(content)}</li>`);
        end = li.n;
        i += 1;
      }
      out.push(`<${tag} ${attrs({ start, end })}>${items.join('')}</${tag}>`);
      continue;
    }

    // Paragraph: consecutive plain lines
    const start = line.n;
    const para: string[] = [];
    let end = line.n;
    while (
      i < lines.length &&
      lines[i]!.text.trim() !== '' &&
      !FENCE.test(lines[i]!.text) &&
      !HEADING.test(lines[i]!.text) &&
      !TABLE_ROW.test(lines[i]!.text) &&
      !BLOCKQUOTE.test(lines[i]!.text) &&
      !UL_ITEM.test(lines[i]!.text) &&
      !OL_ITEM.test(lines[i]!.text)
    ) {
      para.push(lines[i]!.text);
      end = lines[i]!.n;
      i += 1;
    }
    out.push(`<p ${attrs({ kind: 'block', key: 'p', start, end })}>${inline(para.join(' '))}</p>`);
  }

  return out.join('\n');
}

function renderTable(rows: RenderLine[]): string {
  const start = rows[0]!.n;
  const end = rows[rows.length - 1]!.n;
  const cells = (line: string): string[] =>
    line
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());

  const dataRows = rows.filter((r) => !TABLE_SEP.test(r.text));
  if (dataRows.length === 0) return '';

  const header = dataRows[0]!;
  const bodyRows = dataRows.slice(1);
  const thead = `<thead><tr ${attrs({ kind: 'table-row', key: 'tr', start: header.n, end: header.n })}>${cells(header.text)
    .map((c) => `<th ${attrs({ kind: 'table-cell', key: 'th', start: header.n, end: header.n })}>${inline(c)}</th>`)
    .join('')}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map(
      (r) =>
        `<tr ${attrs({ kind: 'table-row', key: 'tr', start: r.n, end: r.n })}>${cells(r.text)
          .map((c) => `<td ${attrs({ kind: 'table-cell', key: 'td', start: r.n, end: r.n })}>${inline(c)}</td>`)
          .join('')}</tr>`,
    )
    .join('')}</tbody>`;
  return `<table ${attrs({ kind: 'table', key: 'table', start, end })}>${thead}${tbody}</table>`;
}
