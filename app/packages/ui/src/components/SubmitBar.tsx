interface SubmitBarProps {
  totalComments: number;
  submitting: boolean;
  submitted: 'approved' | 'changes_requested' | null;
  onApprove: () => void;
  onIncorporate: () => void;
}

export function SubmitBar({ totalComments, submitting, submitted, onApprove, onIncorporate }: SubmitBarProps) {
  if (submitted) {
    return (
      <div className="sp-submitbar">
        <span className="sp-submit-done">
          {submitted === 'approved' ? 'Plan approved — control returned to the agent.' : 'Comments sent — the agent will revise the plan.'}
        </span>
      </div>
    );
  }

  return (
    <div className="sp-submitbar">
      <span className="sp-submit-count">
        {totalComments === 0 ? 'No comments yet' : `${totalComments} comment${totalComments === 1 ? '' : 's'}`}
      </span>
      <div className="sp-submit-actions">
        <button type="button" className="sp-btn" onClick={onApprove} disabled={submitting}>
          Approve Plan
        </button>
        <button
          type="button"
          className="sp-btn sp-btn-primary"
          onClick={onIncorporate}
          disabled={submitting || totalComments === 0}
        >
          Incorporate Comments
        </button>
      </div>
    </div>
  );
}
