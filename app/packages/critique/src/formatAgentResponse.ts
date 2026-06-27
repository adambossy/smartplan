import type { AnnotationSubmission, CommentThread, StoredAnnotationAnchor } from '@smartplan/shared/annotationSchema';
import { type CompiledPlan, flattenTree } from '@smartplan/shared/planSchema';
import { isoToSecond } from '@smartplan/shared/time';
import { TEMPLATES } from './templates.ts';

// Turn a review submission into the agent-facing markdown critique. Same decomposition as
// ContextBridge, extended for the page tree: plan-level threads → General feedback; each page
// with feedback → a Page section containing its page-level notes + its inline annotations, every
// annotation carrying a source slice from THAT page's markdown.
export function formatAgentResponse(plan: CompiledPlan, submission: AnnotationSubmission): string {
  if (submission.status === 'approved') {
    return TEMPLATES.approved({});
  }

  const planThreads = submission.threads.filter((t) => t.subject.kind === 'plan');
  const pageThreads = groupByPage(submission.threads, 'page');
  const annThreads = groupByPage(submission.threads, 'annotation');

  const sections: string[] = [];

  if (planThreads.length > 0) {
    sections.push(TEMPLATES.generalFeedbackSection({ comments: blockquotes(planThreads) }).trimEnd());
  }

  // Emit page sections in manifest (tree) order so the critique reads top-down like the plan.
  for (const node of flattenTree(plan.manifest.root)) {
    const pageId = node.id;
    const pf = pageThreads.get(pageId) ?? [];
    const anns = annThreads.get(pageId) ?? [];
    if (pf.length === 0 && anns.length === 0) continue;

    const page = plan.pages.find((p) => p.id === pageId);
    const sourceFile = `plan-src/${pageId}.md`;
    const sourceLines = page?.sourceLines ?? [];

    const annotationsMd = anns
      .map((thread) => {
        if (thread.subject.kind !== 'annotation') return '';
        const anchor = thread.subject.anchor;
        return TEMPLATES.annotationSection({
          range: formatLineRange(anchor.sourceLines),
          sourceFile,
          sourceSlice: sliceSource(sourceLines, anchor.sourceLines),
          focus: renderFocus(anchor),
          comments: blockquotes([thread]),
        }).trimEnd();
      })
      .filter(Boolean)
      .join('\n\n');

    sections.push(
      TEMPLATES.pageFeedbackSection({
        pageLabel: page?.label ?? pageId,
        pagePath: page?.href ?? '',
        sourceFile,
        pageFeedback: pf.length > 0 ? blockquotes(pf) : '',
        annotations: annotationsMd,
      }).trimEnd(),
    );
  }

  const body = sections.join('\n\n');
  return `${TEMPLATES.changesRequested({ body }).trimEnd()}\n`;
}

function groupByPage(threads: CommentThread[], kind: 'page' | 'annotation'): Map<string, CommentThread[]> {
  const map = new Map<string, CommentThread[]>();
  for (const thread of threads) {
    if (thread.subject.kind !== kind) continue;
    const pageId = thread.subject.pageId;
    const list = map.get(pageId) ?? [];
    list.push(thread);
    map.set(pageId, list);
  }
  return map;
}

function blockquotes(threads: CommentThread[]): string {
  return threads
    .flatMap((thread) =>
      thread.messages.map((m) => {
        const body = m.body
          .replace(/\r\n/g, '\n')
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n');
        return `${body}\n> — ${m.author.kind}, ${isoToSecond(m.createdAt)}`;
      }),
    )
    .join('\n\n');
}

function formatLineRange({ start, end }: { start: number; end: number }): string {
  return start === end ? `line ${start}` : `lines ${start}–${end}`;
}

function sliceSource(lines: string[], { start, end }: { start: number; end: number }): string {
  // sourceLines are 1-indexed; the lines array is 0-indexed.
  return lines.slice(start - 1, end).join('\n');
}

function renderFocus(anchor: StoredAnnotationAnchor): string {
  if (anchor.kind === 'text') {
    const exact = anchor.quote.exact;
    if (exact.includes('\n')) return '';
    return `the highlighted text: \`${exact}\``;
  }
  const label = anchor.element.id ? `: \`${anchor.element.label}\`` : '';
  return `the ${anchor.element.descriptor}${label}`;
}
