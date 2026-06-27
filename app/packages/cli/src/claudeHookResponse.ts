import { formatAgentResponse } from '@smartplan/critique';
import type { AnnotationSubmission } from '@smartplan/shared/annotationSchema';
import type { CompiledPlan } from '@smartplan/shared/planSchema';

// Claude Code PermissionRequest hook response for ExitPlanMode — mirrors ContextBridge's
// claudeHookResponse: approve exits plan mode into acceptEdits; changes_requested denies with the
// compiled critique as the message the agent must act on.
export function toClaudeHookResponse(plan: CompiledPlan, submission: AnnotationSubmission): unknown {
  if (submission.status === 'approved') {
    return {
      decision: {
        behavior: 'allow',
        updatedPermissions: [{ type: 'setMode', mode: 'acceptEdits', destination: 'session' }],
      },
    };
  }
  return {
    decision: {
      behavior: 'deny',
      message: formatAgentResponse(plan, submission),
    },
  };
}
