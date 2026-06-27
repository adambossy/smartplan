import type { AnnotationTargetKind, TextAnnotationAnchor } from '@smartplan/shared/annotationSchema';

// Lifted from ContextBridge packages/annotation/src/annotationTypes.ts (trimmed to the
// framework-agnostic descriptors the index produces/consumes).

export interface AnnotatableTarget {
  id: string;
  key: string;
  kind: AnnotationTargetKind;
  label: string;
  text: string;
  element: HTMLElement;
}

export interface SelectableTextIndex {
  container: HTMLElement;
  fullText: string;
  targets: Map<string, AnnotatableTarget>;
  rangeToAnchor(
    range: Range,
    createdFrom: TextAnnotationAnchor['createdFrom'],
    explicitTarget?: HTMLElement,
  ): TextAnnotationAnchor;
  targetToRange(targetId: string): Range | null;
  restoreAnchor(anchor: TextAnnotationAnchor): Range | null;
  resolveTarget(targetId: string): AnnotatableTarget | null;
}
