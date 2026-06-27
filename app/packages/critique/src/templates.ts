import Handlebars from 'handlebars';
import annotationSectionSource from './templates/annotationSection.hbs' with { type: 'text' };
import approvedSource from './templates/approved.hbs' with { type: 'text' };
import changesRequestedSource from './templates/changesRequested.hbs' with { type: 'text' };
import generalFeedbackSectionSource from './templates/generalFeedbackSection.hbs' with { type: 'text' };
import pageFeedbackSectionSource from './templates/pageFeedbackSection.hbs' with { type: 'text' };

// Compiled once at module load, like ContextBridge's plan/templates.ts. noEscape so markdown
// and backticks pass through untouched.
const opts = { noEscape: true };

export const TEMPLATES = {
  approved: Handlebars.compile<{ source?: string }>(approvedSource, opts),
  changesRequested: Handlebars.compile<{ body: string }>(changesRequestedSource, opts),
  generalFeedbackSection: Handlebars.compile<{ comments: string }>(generalFeedbackSectionSource, opts),
  pageFeedbackSection: Handlebars.compile<{
    pageLabel: string;
    pagePath: string;
    sourceFile: string;
    pageFeedback: string;
    annotations: string;
  }>(pageFeedbackSectionSource, opts),
  annotationSection: Handlebars.compile<{
    range: string;
    sourceFile: string;
    sourceSlice: string;
    focus: string;
    comments: string;
  }>(annotationSectionSource, opts),
};
