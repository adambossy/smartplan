import { buildSelectableTextIndex, snapRangeToTokenBoundaries, type SelectableTextIndex } from '@smartplan/anchor';
import type { CommentThread, TextAnnotationAnchor } from '@smartplan/shared/annotationSchema';
import { useCallbackRef } from './useCallbackRef.ts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface DraftAnchor {
  anchor: TextAnnotationAnchor;
  quote: string;
}

interface UseAnnotationsArgs {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Positioned ancestor the gutter lives in; thread offsets are measured relative to it. */
  layoutRef: React.RefObject<HTMLElement | null>;
  activePageId: string;
  pageThreads: CommentThread[];
  activeThreadId: string | null;
}

interface UseAnnotationsResult {
  draft: DraftAnchor | null;
  cancelDraft: () => void;
  /** vertical offset (px, relative to container top) of each thread's anchor + the draft. */
  threadTops: Map<string, number>;
  draftTop: number | null;
  scrollToThread: (threadId: string) => void;
}

const HL_SAVED = 'smartplan-annotation';
const HL_DRAFT = 'smartplan-draft';
const HL_ACTIVE = 'smartplan-active';

export function useAnnotations(args: UseAnnotationsArgs): UseAnnotationsResult {
  const { containerRef, layoutRef, activePageId, pageThreads, activeThreadId } = args;
  const [draft, setDraft] = useState<DraftAnchor | null>(null);
  const [threadTops, setThreadTops] = useState<Map<string, number>>(new Map());
  const [draftTop, setDraftTop] = useState<number | null>(null);
  const indexRef = useRef<SelectableTextIndex | null>(null);

  // (Re)build the selectable index whenever the rendered page changes.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    indexRef.current = buildSelectableTextIndex(container);
    setDraft(null);
  }, [containerRef, activePageId]);

  // Selection → draft anchor.
  const onMouseUp = useCallbackRef(() => {
    const container = containerRef.current;
    const index = indexRef.current;
    if (!container || !index) return;
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    let range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;
    if (range.toString().trim().length === 0) return;

    range = snapRangeToTokenBoundaries(range, container);
    try {
      const anchor = index.rangeToAnchor(range, 'drag');
      setDraft({ anchor, quote: anchor.quote.exact });
    } catch {
      // selection didn't resolve to annotatable targets — ignore
    }
  });

  useEffect(() => {
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [onMouseUp]);

  // Paint highlights + compute gutter geometry whenever threads/draft change.
  useEffect(() => {
    const container = containerRef.current;
    const index = indexRef.current;
    if (!container || !index) return;

    const recompute = () => {
      if (!('highlights' in CSS)) {
        // Still compute tops for gutter alignment via restored ranges.
      }
      const saved = new Set<Range>();
      const active = new Set<Range>();
      const tops = new Map<string, number>();
      const originTop = (layoutRef.current ?? container).getBoundingClientRect().top;

      for (const thread of pageThreads) {
        if (thread.subject.kind !== 'annotation') continue;
        const anchor = thread.subject.anchor;
        if (anchor.kind !== 'text') continue;
        const range = index.restoreAnchor(anchor);
        if (!range) continue;
        tops.set(thread.id, range.getBoundingClientRect().top - originTop);
        if (thread.id === activeThreadId) active.add(range);
        else saved.add(range);
      }

      let dTop: number | null = null;
      const draftRanges = new Set<Range>();
      if (draft) {
        const range = index.restoreAnchor(draft.anchor);
        if (range) {
          draftRanges.add(range);
          dTop = range.getBoundingClientRect().top - originTop;
        }
      }

      if ('highlights' in CSS) {
        setHighlight(HL_SAVED, saved);
        setHighlight(HL_ACTIVE, active);
        setHighlight(HL_DRAFT, draftRanges);
      }
      setThreadTops(tops);
      setDraftTop(dTop);
    };

    recompute();
    const onScrollResize = () => requestAnimationFrame(recompute);
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('scroll', onScrollResize, true);
    return () => {
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('scroll', onScrollResize, true);
    };
  }, [containerRef, pageThreads, draft, activeThreadId, activePageId]);

  const scrollToThread = useCallbackRef((threadId: string) => {
    const index = indexRef.current;
    if (!index) return;
    const thread = pageThreads.find((t) => t.id === threadId);
    if (!thread || thread.subject.kind !== 'annotation' || thread.subject.anchor.kind !== 'text') return;
    const range = index.restoreAnchor(thread.subject.anchor);
    range?.startContainer.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  return {
    draft,
    cancelDraft: () => {
      setDraft(null);
      window.getSelection()?.removeAllRanges();
    },
    threadTops,
    draftTop,
    scrollToThread,
  };
}

function setHighlight(name: string, ranges: Set<Range>): void {
  // @ts-expect-error Highlight is not yet in lib.dom for all TS versions
  const hl = new Highlight(...ranges);
  // @ts-expect-error CSS.highlights registry
  CSS.highlights.set(name, hl);
}
