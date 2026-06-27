import type { CommentThread } from '@smartplan/shared/annotationSchema';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DraftAnchor } from '../annotations.ts';

interface GutterProps {
  pageThreads: CommentThread[];
  threadTops: Map<string, number>;
  draft: DraftAnchor | null;
  draftTop: number | null;
  activeThreadId: string | null;
  onSetActive: (id: string | null) => void;
  onSaveDraft: (body: string) => void;
  onCancelDraft: () => void;
  onRemoveThread: (id: string) => void;
}

const CARD_MIN_GAP = 8;

export function Gutter(props: GutterProps) {
  const { pageThreads, threadTops, draft, draftTop, activeThreadId, onSetActive, onSaveDraft, onCancelDraft, onRemoveThread } =
    props;

  // Lay out cards top-to-bottom, nudging down to avoid overlap.
  const positioned = useMemo(() => {
    const items = pageThreads
      .filter((t) => threadTops.has(t.id))
      .map((t) => ({ thread: t, top: threadTops.get(t.id)! }))
      .sort((a, b) => a.top - b.top);
    let last = -Infinity;
    return items.map((item) => {
      const top = Math.max(item.top, last + CARD_MIN_GAP);
      last = top + 64; // approx card height for spacing
      return { ...item, top };
    });
  }, [pageThreads, threadTops]);

  return (
    <div className="sp-gutter">
      {positioned.length === 0 && !draft && (
        <p className="sp-gutter-empty">Select any text in the plan to leave a comment.</p>
      )}

      {positioned.map(({ thread, top }) => (
        <ThreadCard
          key={thread.id}
          thread={thread}
          top={top}
          active={thread.id === activeThreadId}
          onActivate={() => onSetActive(thread.id)}
          onRemove={() => onRemoveThread(thread.id)}
        />
      ))}

      {draft && <Composer top={draftTop ?? 0} quote={draft.quote} onSave={onSaveDraft} onCancel={onCancelDraft} />}
    </div>
  );
}

function ThreadCard({
  thread,
  top,
  active,
  onActivate,
  onRemove,
}: {
  thread: CommentThread;
  top: number;
  active: boolean;
  onActivate: () => void;
  onRemove: () => void;
}) {
  const message = thread.messages[0];
  const quote = thread.subject.kind === 'annotation' && thread.subject.anchor.kind === 'text' ? thread.subject.anchor.quote.exact : '';
  return (
    <article
      className={`sp-card${active ? ' is-active' : ''}`}
      style={{ top: `${top}px` }}
      onMouseEnter={onActivate}
      onClick={onActivate}
    >
      {quote && <div className="sp-card-quote">{quote}</div>}
      <p className="sp-card-body">{message?.body}</p>
      <div className="sp-card-foot">
        <span>You</span>
        <button type="button" className="sp-link-btn" onClick={onRemove}>
          Delete
        </button>
      </div>
    </article>
  );
}

function Composer({
  top,
  quote,
  onSave,
  onCancel,
}: {
  top: number;
  quote: string;
  onSave: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);

  const save = () => {
    if (body.trim()) onSave(body.trim());
  };

  return (
    <article className="sp-card sp-composer" style={{ top: `${top}px` }}>
      {quote && <div className="sp-card-quote">{quote}</div>}
      <textarea
        ref={ref}
        value={body}
        placeholder="Comment on this passage…"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
          if (e.key === 'Escape') onCancel();
        }}
      />
      <div className="sp-composer-actions">
        <button type="button" className="sp-btn sp-btn-primary" onClick={save} disabled={!body.trim()}>
          Comment
        </button>
        <button type="button" className="sp-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </article>
  );
}
