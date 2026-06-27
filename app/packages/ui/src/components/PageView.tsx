import type { CompiledPage, CompiledPlan } from '@smartplan/shared/planSchema';
import mermaid from 'mermaid';
import { useEffect } from 'react';
import { REQUIREMENTS_READ_ID } from '../state.ts';

interface PageViewProps {
  plan: CompiledPlan;
  page: CompiledPage;
  contentRef: React.RefObject<HTMLDivElement | null>;
  readSections: Record<string, boolean>;
  onToggleSection: (sectionId: string) => void;
  onNavigate: (pageId: string) => void;
}

mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });

export function PageView({ plan, page, contentRef, readSections, onToggleSection, onNavigate }: PageViewProps) {
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>('.mermaid:not([data-processed])'));
    if (nodes.length > 0) {
      mermaid.run({ nodes }).catch(() => undefined);
    }
  }, [contentRef, page.id]);

  // Intercept intra-plan links so they navigate within the app.
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('a');
    if (!target) return;
    const href = target.getAttribute('href') ?? '';
    const pageId = resolveHrefToPageId(plan, href);
    if (pageId) {
      e.preventDefault();
      onNavigate(pageId);
    }
  };

  const crumbs = breadcrumbTrail(plan, page);

  return (
    <div className="sp-page">
      <p className="sp-crumbs">
        {crumbs.map((c, i) => (
          <span key={c.id}>
            {i > 0 && <span className="sp-crumb-sep"> / </span>}
            {c.id === page.id ? (
              <span>{c.label}</span>
            ) : (
              <button type="button" className="sp-crumb-link" onClick={() => onNavigate(c.id)}>
                {c.label}
              </button>
            )}
          </span>
        ))}
      </p>

      <p className="sp-eyebrow">{page.eyebrow}</p>

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div className="sp-content" ref={contentRef} onClick={onClick}>
        <header className="sp-page-header">
          <h1
            data-target-kind="block"
            data-target-key="h1"
            data-src-start-line={page.titleLine}
            data-src-end-line={page.titleLine}
          >
            {page.title}
          </h1>
          {page.lede && (
            <p
              className="sp-lede"
              data-target-kind="block"
              data-target-key="p"
              data-src-start-line={page.ledeStartLine || page.titleLine}
              data-src-end-line={page.ledeEndLine || page.titleLine}
              dangerouslySetInnerHTML={{ __html: page.lede }}
            />
          )}
        </header>

        {page.requirements.length > 0 && (
          <section className="sp-requirements">
            <header className="sp-requirements-header">
              <h2>Requirements</h2>
              <label className="sp-section-check" title="Mark requirements as read">
                <input
                  type="checkbox"
                  checked={Boolean(readSections[REQUIREMENTS_READ_ID])}
                  onChange={() => onToggleSection(REQUIREMENTS_READ_ID)}
                  aria-label="Mark requirements as read"
                />
              </label>
            </header>
            <ol>
              {page.requirements.map((r, i) => (
                <li
                  key={i}
                  data-target-kind="list-item"
                  data-target-key="li"
                  data-src-start-line={r.line}
                  data-src-end-line={r.line}
                  dangerouslySetInnerHTML={{ __html: r.html }}
                />
              ))}
            </ol>
          </section>
        )}

        {page.sections.map((section) => (
          <section className="sp-section" id={section.id} key={section.id}>
            <header className="sp-section-header">
              <h2
                data-target-kind="block"
                data-target-key="h2"
                data-src-start-line={section.headingLine}
                data-src-end-line={section.headingLine}
              >
                {section.title}
              </h2>
              <label className="sp-section-check" title="Mark section as read">
                <input
                  type="checkbox"
                  checked={Boolean(readSections[section.id])}
                  onChange={() => onToggleSection(section.id)}
                  aria-label="Mark section as read"
                />
              </label>
            </header>
            <div className="sp-section-body" dangerouslySetInnerHTML={{ __html: section.html }} />
          </section>
        ))}
      </div>
    </div>
  );
}

function breadcrumbTrail(plan: CompiledPlan, page: CompiledPage): { id: string; label: string }[] {
  const byId = new Map(plan.pages.map((p) => [p.id, p]));
  const trail: { id: string; label: string }[] = [];
  let current: CompiledPage | undefined = page;
  while (current) {
    trail.unshift({ id: current.id, label: current.id === plan.manifest.root.id ? plan.title : current.label });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return trail;
}

function resolveHrefToPageId(plan: CompiledPlan, href: string): string | null {
  if (!href || href.startsWith('http') || href.startsWith('#')) return null;
  const normalized = href.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  const match = plan.pages.find((p) => p.href === normalized || p.href.endsWith(`/${normalized}`));
  return match ? match.id : null;
}
