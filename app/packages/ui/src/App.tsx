import type { AnnotationStatus } from '@smartplan/shared/annotationSchema';
import type { CompiledPlan } from '@smartplan/shared/planSchema';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnnotations } from './annotations.ts';
import { Drawers } from './components/Drawers.tsx';
import { Gutter } from './components/Gutter.tsx';
import { PageView } from './components/PageView.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { SubmitBar } from './components/SubmitBar.tsx';
import { loadCompiledPlan } from './data.ts';
import { useInlineEdit } from './useInlineEdit.ts';
import { useReview } from './state.ts';

export function App() {
  const [plan, setPlan] = useState<CompiledPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCompiledPlan()
      .then(setPlan)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="sp-fatal">{error}</div>;
  if (!plan) return <div className="sp-loading">Loading plan…</div>;
  return <Review plan={plan} />;
}

function Review({ plan }: { plan: CompiledPlan }) {
  const review = useReview(plan);
  const contentRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<AnnotationStatus | null>(null);

  const page = plan.pages.find((p) => p.id === review.activePageId) ?? plan.pages[0]!;
  const pageThreads = useMemo(
    () => review.annotationThreads.filter((t) => t.subject.kind === 'annotation' && t.subject.pageId === page.id),
    [review.annotationThreads, page.id],
  );

  const ann = useAnnotations({
    containerRef: contentRef,
    layoutRef: mainRef,
    activePageId: page.id,
    pageThreads,
    activeThreadId,
    enabled: !editing,
  });

  useInlineEdit({ containerRef: contentRef, editing, pageId: page.id });

  const navigate = (id: string) => {
    setActiveThreadId(null);
    review.setActivePageId(id);
    window.scrollTo({ top: 0 });
  };

  const submit = async (status: AnnotationStatus) => {
    setSubmitting(true);
    const submission = review.buildSubmission(status);
    try {
      await fetch('/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submission),
      });
    } catch {
      // dev mode without a server — still reflect the outcome
      console.info('submission (no server):', submission);
    }
    setSubmitting(false);
    setSubmitted(status);
  };

  return (
    <div className={`sp-layout${editing ? ' sp-editing' : ''}`}>
      <button
        type="button"
        className={`sp-edit-toggle${editing ? ' is-on' : ''}`}
        onClick={() => {
          setActiveThreadId(null);
          setEditing((v) => !v);
        }}
        title={editing ? 'Finish editing and return to commenting' : 'Edit the plan text inline'}
      >
        {editing ? 'Done Editing' : 'Edit Text'}
      </button>

      <Sidebar
        plan={plan}
        activePageId={page.id}
        onNavigate={navigate}
        readDotByNode={review.readDotByNode}
        commentCountByNode={review.commentCountByNode}
        readState={review.readState}
        onResetReadState={review.resetReadState}
      />

      <main className="sp-main" ref={mainRef}>
        <div className="sp-main-inner">
          <PageView
            plan={plan}
            page={page}
            contentRef={contentRef}
            readSections={review.readState[page.id] ?? {}}
            onToggleSection={(sectionId) => review.toggleSection(page.id, sectionId)}
            onNavigate={navigate}
          />
          <Drawers
            pageLabel={page.label}
            pageFeedback={review.pageFeedback[page.id] ?? ''}
            onPageFeedback={(body) => review.setPageFeedback(page.id, body)}
            planFeedback={review.planFeedback}
            onPlanFeedback={review.setPlanFeedback}
          />
          <SubmitBar
            totalComments={review.totalComments}
            submitting={submitting}
            submitted={submitted}
            onApprove={() => submit('approved')}
            onIncorporate={() => submit('changes_requested')}
          />
        </div>
      </main>

      <div className="sp-gutter-col">
        <Gutter
          pageThreads={pageThreads}
          threadTops={ann.threadTops}
          draft={ann.draft}
          draftTop={ann.draftTop}
          activeThreadId={activeThreadId}
          onSetActive={setActiveThreadId}
          onSaveDraft={(body) => {
            if (ann.draft) review.addAnnotation(page.id, ann.draft.anchor, body);
            ann.cancelDraft();
          }}
          onCancelDraft={ann.cancelDraft}
          onRemoveThread={review.removeThread}
        />
      </div>
    </div>
  );
}
