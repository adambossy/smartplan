import type {
  AnnotationStatus,
  AnnotationSubmission,
  CommentThread,
  StoredAnnotationAnchor,
} from '@smartplan/shared/annotationSchema';
import { type CompiledPage, type CompiledPlan, type TreeNode, flattenTree } from '@smartplan/shared/planSchema';

/** Read-state id used for a page's Requirements block (which isn't a manifest section). */
export const REQUIREMENTS_READ_ID = '__requirements__';

/** Every unit on a page that can be marked read: the requirements block (if any) + sections. */
export function readableUnitIds(page: CompiledPage): string[] {
  const ids = page.sections.map((s) => s.id);
  if (page.requirements.length > 0) ids.unshift(REQUIREMENTS_READ_ID);
  return ids;
}
import { nowIso } from '@smartplan/shared/time';
import { useCallback, useEffect, useMemo, useState } from 'react';

const LOCAL_AUTHOR = { id: 'local-user', kind: 'user' as const, displayName: 'You' };

export type ReadState = Record<string, Record<string, boolean>>;

export interface ReviewState {
  plan: CompiledPlan;
  activePageId: string;
  setActivePageId: (id: string) => void;

  // annotation threads (inline, text-anchored), flat across pages
  annotationThreads: CommentThread[];
  addAnnotation: (pageId: string, anchor: StoredAnnotationAnchor, body: string) => void;
  removeThread: (threadId: string) => void;

  // coarse feedback
  pageFeedback: Record<string, string>;
  setPageFeedback: (pageId: string, body: string) => void;
  planFeedback: string;
  setPlanFeedback: (body: string) => void;

  // read state
  readState: ReadState;
  toggleSection: (pageId: string, sectionId: string) => void;
  resetReadState: () => void;

  // derived
  commentCountByNode: Map<string, number>;
  readDotByNode: Map<string, 'empty' | 'partial' | 'full'>;
  totalComments: number;

  buildSubmission: (status: AnnotationStatus) => AnnotationSubmission;
}

export function useReview(plan: CompiledPlan): ReviewState {
  const nodes = useMemo(() => flattenTree(plan.manifest.root), [plan]);
  const [activePageId, setActivePageId] = useState(plan.manifest.root.id);
  const [annotationThreads, setAnnotationThreads] = useState<CommentThread[]>([]);
  const [pageFeedback, setPageFeedbackState] = useState<Record<string, string>>({});
  const [planFeedback, setPlanFeedback] = useState('');
  const [readState, setReadState] = useState<ReadState>(() => loadReadState(plan.planId));

  useEffect(() => {
    saveReadState(plan.planId, readState);
  }, [plan.planId, readState]);

  const addAnnotation = useCallback((pageId: string, anchor: StoredAnnotationAnchor, body: string) => {
    setAnnotationThreads((prev) => [
      ...prev,
      {
        id: createId('thr_annotation'),
        subject: { kind: 'annotation', pageId, anchor },
        messages: [{ id: createId('msg'), author: LOCAL_AUTHOR, body, createdAt: nowIso() }],
      },
    ]);
  }, []);

  const removeThread = useCallback((threadId: string) => {
    setAnnotationThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, []);

  const setPageFeedback = useCallback((pageId: string, body: string) => {
    setPageFeedbackState((prev) => ({ ...prev, [pageId]: body }));
  }, []);

  const toggleSection = useCallback((pageId: string, sectionId: string) => {
    setReadState((prev) => {
      const page = { ...(prev[pageId] ?? {}) };
      if (page[sectionId]) delete page[sectionId];
      else page[sectionId] = true;
      return { ...prev, [pageId]: page };
    });
  }, []);

  const resetReadState = useCallback(() => setReadState({}), []);

  // ---- derived: comment counts, rolled up the tree ----
  const commentCountByNode = useMemo(() => {
    const direct = new Map<string, number>();
    const bump = (id: string, by = 1) => direct.set(id, (direct.get(id) ?? 0) + by);
    for (const t of annotationThreads) {
      if (t.subject.kind === 'annotation') bump(t.subject.pageId);
    }
    for (const [pageId, body] of Object.entries(pageFeedback)) {
      if (body.trim()) bump(pageId);
    }
    if (planFeedback.trim()) bump(plan.manifest.root.id);
    return rollUp(plan.manifest.root, direct);
  }, [annotationThreads, pageFeedback, planFeedback, plan]);

  const totalComments = commentCountByNode.get(plan.manifest.root.id) ?? 0;

  // ---- derived: read-state dots ----
  const readDotByNode = useMemo(() => {
    const direct = new Map<string, 'empty' | 'partial' | 'full'>();
    const pageById = new Map(plan.pages.map((p) => [p.id, p]));
    for (const node of nodes) {
      const page = pageById.get(node.id);
      const units = page ? readableUnitIds(page) : node.sections;
      const total = units.length;
      const read = units.filter((id) => readState[node.id]?.[id]).length;
      direct.set(node.id, total === 0 ? 'empty' : read === 0 ? 'empty' : read >= total ? 'full' : 'partial');
    }
    return direct;
  }, [readState, nodes, plan]);

  const buildSubmission = useCallback(
    (status: AnnotationStatus): AnnotationSubmission => {
      const threads: CommentThread[] = [...annotationThreads];
      for (const [pageId, body] of Object.entries(pageFeedback)) {
        if (body.trim()) {
          threads.push({
            id: createId('thr_page'),
            subject: { kind: 'page', pageId },
            messages: [{ id: createId('msg'), author: LOCAL_AUTHOR, body: body.trim(), createdAt: nowIso() }],
          });
        }
      }
      if (planFeedback.trim()) {
        threads.push({
          id: createId('thr_plan'),
          subject: { kind: 'plan' },
          messages: [{ id: createId('msg'), author: LOCAL_AUTHOR, body: planFeedback.trim(), createdAt: nowIso() }],
        });
      }
      return { status, threads };
    },
    [annotationThreads, pageFeedback, planFeedback],
  );

  return {
    plan,
    activePageId,
    setActivePageId,
    annotationThreads,
    addAnnotation,
    removeThread,
    pageFeedback,
    setPageFeedback,
    planFeedback,
    setPlanFeedback,
    readState,
    toggleSection,
    resetReadState,
    commentCountByNode,
    readDotByNode,
    totalComments,
    buildSubmission,
  };
}

export function totalSectionsRead(plan: CompiledPlan, readState: ReadState): { read: number; total: number } {
  let read = 0;
  let total = 0;
  for (const page of plan.pages) {
    const units = readableUnitIds(page);
    total += units.length;
    read += units.filter((id) => readState[page.id]?.[id]).length;
  }
  return { read, total };
}

function rollUp(root: TreeNode, direct: Map<string, number>): Map<string, number> {
  const totals = new Map<string, number>();
  const visit = (node: TreeNode): number => {
    let sum = direct.get(node.id) ?? 0;
    for (const child of node.children) sum += visit(child);
    totals.set(node.id, sum);
    return sum;
  };
  visit(root);
  return totals;
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

function loadReadState(planId: string): ReadState {
  try {
    const raw = localStorage.getItem(`smartplan:${planId}`);
    return raw ? (JSON.parse(raw) as ReadState) : {};
  } catch {
    return {};
  }
}

function saveReadState(planId: string, state: ReadState): void {
  try {
    localStorage.setItem(`smartplan:${planId}`, JSON.stringify(state));
  } catch {
    // ignore quota / availability errors
  }
}
