interface DrawersProps {
  pageLabel: string;
  pageFeedback: string;
  onPageFeedback: (body: string) => void;
  planFeedback: string;
  onPlanFeedback: (body: string) => void;
}

export function Drawers({ pageLabel, pageFeedback, onPageFeedback, planFeedback, onPlanFeedback }: DrawersProps) {
  return (
    <div className="sp-drawers">
      <details className="sp-drawer" open={Boolean(pageFeedback)}>
        <summary>
          Feedback on this page <span className="sp-drawer-scope">{pageLabel}</span>
          {pageFeedback.trim() && <span className="sp-drawer-dot" aria-hidden="true" />}
        </summary>
        <textarea
          className="sp-drawer-input"
          value={pageFeedback}
          placeholder={`What should change on "${pageLabel}"? This captures your intent for this page — edits may ripple to others.`}
          onChange={(e) => onPageFeedback(e.target.value)}
        />
      </details>

      <details className="sp-drawer" open={Boolean(planFeedback)}>
        <summary>
          General feedback on the plan
          {planFeedback.trim() && <span className="sp-drawer-dot" aria-hidden="true" />}
        </summary>
        <textarea
          className="sp-drawer-input"
          value={planFeedback}
          placeholder="Feedback about the plan as a whole."
          onChange={(e) => onPlanFeedback(e.target.value)}
        />
      </details>
    </div>
  );
}
