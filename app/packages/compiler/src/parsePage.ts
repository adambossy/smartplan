import { marked } from 'marked';
import { renderBlocks, type RenderLine } from './renderMarkdown.ts';

export interface ParsedFrontmatter {
  id: string;
  label: string;
  parent: string | null;
  sections: string[];
  crosslinks: string[];
}

export interface ParsedSection {
  id: string;
  title: string;
  html: string;
  /** 1-indexed source line of the `## id — title` heading, for anchoring the heading itself. */
  headingLine: number;
}

export interface ParsedRequirement {
  html: string;
  line: number;
}

export interface ParsedPage {
  front: ParsedFrontmatter;
  title: string;
  /** 1-indexed source line of the `# Title` heading. */
  titleLine: number;
  ledeHtml: string;
  /** 1-indexed source line span of the lede (0/0 if none). */
  ledeStartLine: number;
  ledeEndLine: number;
  requirements: ParsedRequirement[];
  sections: ParsedSection[];
  /** Raw source lines of the whole .md file (index 0 === file line 1). */
  rawLines: string[];
}

const SECTION_HEADING = /^##\s+([A-Za-z0-9-]+)\s+—\s+(.+?)\s*$/;
const REQUIREMENTS_HEADING = /^##\s+Requirements\s*$/;
const H1 = /^#\s+(.+?)\s*$/;
const LIST_ITEM = /^[-*]\s+(.*)$/;

export function parsePage(raw: string): ParsedPage {
  const lines = raw.split('\n');
  const front = parseFrontmatter(lines);

  // Body begins after the closing frontmatter fence.
  let bodyStart = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.indexOf('---', 1);
    bodyStart = end === -1 ? 1 : end + 1;
  }

  let title = front.label;
  let titleLine = bodyStart + 1;
  const ledeLines: string[] = [];
  let ledeStartLine = 0;
  let ledeEndLine = 0;
  const requirements: ParsedRequirement[] = [];
  const sections: ParsedSection[] = [];

  let i = bodyStart;
  // H1 + lede (everything up to the first ## heading)
  while (i < lines.length && !lines[i]!.startsWith('## ')) {
    const h1 = lines[i]!.match(H1);
    if (h1) {
      title = h1[1]!;
      titleLine = i + 1;
    } else if (lines[i]!.trim() !== '') {
      ledeLines.push(lines[i]!.trim());
      if (ledeStartLine === 0) ledeStartLine = i + 1;
      ledeEndLine = i + 1;
    }
    i += 1;
  }
  const ledeHtml = ledeLines.length ? (marked.parseInline(ledeLines.join(' ')) as string) : '';

  // Sections (and the optional Requirements block)
  while (i < lines.length) {
    const line = lines[i]!;
    const reqMatch = line.match(REQUIREMENTS_HEADING);
    const secMatch = line.match(SECTION_HEADING);
    if (!reqMatch && !secMatch) {
      i += 1;
      continue;
    }

    // Gather body lines until the next ## heading.
    const bodyLines: RenderLine[] = [];
    let j = i + 1;
    while (j < lines.length && !lines[j]!.startsWith('## ')) {
      bodyLines.push({ n: j + 1, text: lines[j]! });
      j += 1;
    }

    if (reqMatch) {
      for (const bl of bodyLines) {
        const item = bl.text.match(LIST_ITEM);
        if (item) requirements.push({ html: marked.parseInline(item[1]!) as string, line: bl.n });
      }
    } else if (secMatch) {
      const id = secMatch[1]!;
      const secTitle = secMatch[2]!;
      sections.push({ id, title: secTitle, html: renderBlocks(bodyLines), headingLine: i + 1 });
    }
    i = j;
  }

  return { front, title, titleLine, ledeHtml, ledeStartLine, ledeEndLine, requirements, sections, rawLines: lines };
}

function parseFrontmatter(lines: string[]): ParsedFrontmatter {
  const front: ParsedFrontmatter = { id: '', label: '', parent: null, sections: [], crosslinks: [] };
  if (lines[0]?.trim() !== '---') return front;
  const end = lines.indexOf('---', 1);
  const block = end === -1 ? lines.slice(1) : lines.slice(1, end);

  for (const line of block) {
    const m = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const value = m[2]!.trim();
    if (key === 'id') front.id = value;
    else if (key === 'label') front.label = stripQuotes(value);
    else if (key === 'parent') front.parent = value === '' || value === '""' ? null : value;
    else if (key === 'sections') front.sections = parseList(value);
    else if (key === 'crosslinks') front.crosslinks = parseList(value);
  }
  return front;
}

function parseList(value: string): string[] {
  const inner = value.replace(/^\[/, '').replace(/\]$/, '').trim();
  if (inner === '') return [];
  return inner
    .split(',')
    .map((s) => stripQuotes(s.trim()))
    .filter((s) => s.length > 0);
}

function stripQuotes(value: string): string {
  return value.replace(/^["']/, '').replace(/["']$/, '');
}
