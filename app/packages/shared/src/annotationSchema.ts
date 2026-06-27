import { z } from 'zod';

// ---------------------------------------------------------------------------
// Anchors — lifted verbatim from ContextBridge (@contextbridge/shared) so the
// resilient quote/position/endpoint/source-line machinery is identical. The
// page dimension is carried on the thread *subject*, not the anchor, so anchors
// stay purely about locating text/elements within a single page.
// ---------------------------------------------------------------------------

export const TextQuoteSelectorSchema = z.object({
  exact: z.string().min(1),
  prefix: z.string(),
  suffix: z.string(),
});
export type TextQuoteSelector = z.infer<typeof TextQuoteSelectorSchema>;

export const TextPositionSelectorSchema = z
  .object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
  })
  .refine((value) => value.end >= value.start, { message: 'end must be >= start', path: ['end'] });
export type TextPositionSelector = z.infer<typeof TextPositionSelectorSchema>;

export const TextEndpointSchema = z.object({
  targetId: z.string().min(1),
  offset: z.number().int().nonnegative(),
});
export type TextEndpoint = z.infer<typeof TextEndpointSchema>;

export const AnnotationTargetKindSchema = z.enum([
  'block',
  'inline',
  'list-item',
  'table-cell',
  'table-row',
  'table',
  'code-block',
]);
export type AnnotationTargetKind = z.infer<typeof AnnotationTargetKindSchema>;

export const AnnotationTargetSnapshotSchema = z.object({
  id: z.string().min(1),
  kind: AnnotationTargetKindSchema,
  label: z.string().min(1),
});
export type AnnotationTargetSnapshot = z.infer<typeof AnnotationTargetSnapshotSchema>;

export const SourceLineRangeSchema = z
  .object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine((value) => value.end >= value.start, { message: 'end must be >= start' });
export type SourceLineRange = z.infer<typeof SourceLineRangeSchema>;

export const TextAnnotationAnchorSchema = z.object({
  kind: z.literal('text'),
  createdFrom: z.enum(['drag', 'element']),
  sourceLines: SourceLineRangeSchema,
  quote: TextQuoteSelectorSchema,
  position: TextPositionSelectorSchema,
  endpoints: z.object({ start: TextEndpointSchema, end: TextEndpointSchema }),
  target: AnnotationTargetSnapshotSchema.optional(),
  snapshot: z.object({
    targetText: z.string().min(1),
    blockText: z.string().min(1).optional(),
  }),
});
export type TextAnnotationAnchor = z.infer<typeof TextAnnotationAnchorSchema>;

// Element anchors (e.g. a Mermaid node) — kept for parity; element adapters can
// fill this in later. Text anchors are the default path.
export const ElementAnnotationAnchorSchema = z.object({
  kind: z.literal('element'),
  contentType: z.string().min(1),
  blockTargetId: z.string().min(1),
  sourceLines: SourceLineRangeSchema,
  element: z.object({
    id: z.string().min(1).optional(),
    label: z.string().min(1),
    descriptor: z.string().min(1),
  }),
});
export type ElementAnnotationAnchor = z.infer<typeof ElementAnnotationAnchorSchema>;

export const StoredAnnotationAnchorSchema = z.discriminatedUnion('kind', [
  TextAnnotationAnchorSchema,
  ElementAnnotationAnchorSchema,
]);
export type StoredAnnotationAnchor = z.infer<typeof StoredAnnotationAnchorSchema>;

// ---------------------------------------------------------------------------
// Comments — author/message lifted; the SUBJECT union is extended for the tree:
//   plan        → general feedback about the whole plan
//   page        → page-level feedback ("change what's on this page")
//   annotation  → inline, text-anchored comment in the right gutter
// page + annotation carry pageId so threads aggregate across the tree.
// ---------------------------------------------------------------------------

export const CommentAuthorSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['user', 'agent']),
  displayName: z.string().trim().min(1),
});
export type CommentAuthor = z.infer<typeof CommentAuthorSchema>;

export const CommentMessageSchema = z.object({
  id: z.string().min(1),
  author: CommentAuthorSchema,
  body: z.string().trim().min(1),
  createdAt: z.string().min(1),
});
export type CommentMessage = z.infer<typeof CommentMessageSchema>;

export const CommentThreadSubjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan') }),
  z.object({ kind: z.literal('page'), pageId: z.string().min(1) }),
  z.object({ kind: z.literal('annotation'), pageId: z.string().min(1), anchor: StoredAnnotationAnchorSchema }),
]);
export type CommentThreadSubject = z.infer<typeof CommentThreadSubjectSchema>;

export const CommentThreadSchema = z.object({
  id: z.string().min(1),
  subject: CommentThreadSubjectSchema,
  messages: z.array(CommentMessageSchema).min(1),
});
export type CommentThread = z.infer<typeof CommentThreadSchema>;

export const AnnotationStatusSchema = z.enum(['approved', 'changes_requested']);
export type AnnotationStatus = z.infer<typeof AnnotationStatusSchema>;

export const AnnotationSubmissionSchema = z.object({
  status: AnnotationStatusSchema,
  threads: z.array(CommentThreadSchema).default([]),
});
export type AnnotationSubmission = z.infer<typeof AnnotationSubmissionSchema>;
