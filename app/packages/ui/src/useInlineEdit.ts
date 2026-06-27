import { useEffect } from 'react';
import { postSourceEdit } from './data.ts';

// Inline editing: when `editing` is on, prose blocks become editable and edits live-sync to the
// datastore (debounced). After a write that changes the line count, we shift the source-line
// attributes of later blocks so the map stays correct without re-rendering (and losing the caret).
const EDITABLE_SELECTOR = '[data-target-kind="block"], [data-target-kind="list-item"], [data-target-kind="table-cell"]';
const DEBOUNCE_MS = 700;

export function useInlineEdit(args: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  editing: boolean;
  pageId: string;
}): void {
  const { containerRef, editing, pageId } = args;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const blocks = Array.from(container.querySelectorAll<HTMLElement>(EDITABLE_SELECTOR));
    if (!editing) {
      for (const el of blocks) el.removeAttribute('contenteditable');
      return;
    }

    const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

    const sync = async (el: HTMLElement) => {
      const startLine = Number(el.dataset.srcStartLine);
      const endLine = Number(el.dataset.srcEndLine);
      if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) return;
      const text = (el.innerText ?? '').replace(/ /g, ' ').replace(/\n+$/, '');
      const result = await postSourceEdit({ pageId, startLine, endLine, text });
      if (!result || result.lineDelta === 0) return;

      // Keep the source-line map in lockstep: grow this block, shift everything after it.
      el.dataset.srcEndLine = String(endLine + result.lineDelta);
      for (const other of container.querySelectorAll<HTMLElement>('[data-src-start-line]')) {
        const otherStart = Number(other.dataset.srcStartLine);
        if (Number.isFinite(otherStart) && otherStart > endLine) {
          other.dataset.srcStartLine = String(otherStart + result.lineDelta);
          const otherEnd = Number(other.dataset.srcEndLine);
          if (Number.isFinite(otherEnd)) other.dataset.srcEndLine = String(otherEnd + result.lineDelta);
        }
      }
    };

    const onInput = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>(EDITABLE_SELECTOR);
      if (!el || !container.contains(el)) return;
      const existing = timers.get(el);
      if (existing) clearTimeout(existing);
      timers.set(
        el,
        setTimeout(() => {
          timers.delete(el);
          void sync(el);
        }, DEBOUNCE_MS),
      );
    };

    for (const el of blocks) el.setAttribute('contenteditable', 'plaintext-only');
    container.addEventListener('input', onInput);

    return () => {
      container.removeEventListener('input', onInput);
      for (const [el, t] of timers) {
        clearTimeout(t);
        void sync(el); // flush pending edits on teardown (page change / mode off)
      }
      for (const el of blocks) el.removeAttribute('contenteditable');
    };
  }, [containerRef, editing, pageId]);
}
