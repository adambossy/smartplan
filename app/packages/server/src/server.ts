import { type AnnotationSubmission, AnnotationSubmissionSchema } from '@smartplan/shared/annotationSchema';
import type { CompiledPlan } from '@smartplan/shared/planSchema';
import { z } from 'zod';

export interface SourceEdit {
  pageId: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface PlanEntry {
  planId: string;
  plan: CompiledPlan;
  /** Persist an inline edit back to this plan's datastore; returns the line delta + recompiled plan. */
  onEditSource?: (edit: SourceEdit) => { lineDelta: number; plan: CompiledPlan };
}

export interface ReviewServer {
  /** Index URL listing all served plans. */
  url: string;
  /** Per-plan review URL (the page the browser opens). */
  planUrl: (planId: string) => string;
  /** Resolves when this one plan is submitted. */
  resultFor: (planId: string) => Promise<AnnotationSubmission>;
  /** Resolves when every served plan has been submitted once (Option B). */
  allResults: Promise<Map<string, AnnotationSubmission>>;
  stop: () => void;
}

export interface StartReviewServerOptions {
  plans: PlanEntry[];
  /** The built single-file UI HTML, served for every plan. */
  html: string;
  port?: number;
}

const SourceEditSchema = z.object({
  pageId: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string(),
});

interface PlanState {
  plan: CompiledPlan; // mutable: updated as inline edits recompile
  onEditSource?: (edit: SourceEdit) => { lineDelta: number; plan: CompiledPlan };
  resolve: (submission: AnnotationSubmission) => void;
  promise: Promise<AnnotationSubmission>;
  done: boolean;
}

// Ephemeral, multi-plan review server. Serves any number of plans from one process, each under
// /p/<planId>/, blocking until every plan has been submitted once. Lifts ContextBridge's
// 127.0.0.1:0 + setTimeout(0)-flush-before-stop mechanics; extends them to a plan registry.
export function startReviewServer(options: StartReviewServerOptions): ReviewServer {
  const { plans, html, port = 0 } = options;

  const state = new Map<string, PlanState>();
  const collected = new Map<string, AnnotationSubmission>();
  let resolveAll!: (m: Map<string, AnnotationSubmission>) => void;
  const allResults = new Promise<Map<string, AnnotationSubmission>>((resolve) => {
    resolveAll = resolve;
  });

  for (const entry of plans) {
    let resolve!: (submission: AnnotationSubmission) => void;
    const promise = new Promise<AnnotationSubmission>((r) => {
      resolve = r;
    });
    state.set(entry.planId, { plan: entry.plan, onEditSource: entry.onEditSource, resolve, promise, done: false });
  }
  if (state.size === 0) resolveAll(collected);

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  const htmlResponse = () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const notFound = () => new Response('not found', { status: 404 });

  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    routes: {
      '/': () => new Response(indexHtml(state), { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      '/p/:planId': (req) =>
        new Response(null, { status: 302, headers: { location: `/p/${req.params.planId}/` } }),
      '/p/:planId/': (req) => (state.has(req.params.planId) ? htmlResponse() : notFound()),
      '/p/:planId/payload': (req) => planJson(req.params.planId),
      '/p/:planId/compiled-plan.json': (req) => planJson(req.params.planId),
      '/p/:planId/source': { POST: (req) => handleSourceEdit(req.params.planId, req) },
      '/p/:planId/submit': { POST: (req) => handleSubmit(req.params.planId, req) },
    },
    fetch: () => notFound(),
  });

  function planJson(planId: string): Response {
    const s = state.get(planId);
    return s ? json(s.plan) : notFound();
  }

  async function handleSourceEdit(planId: string, req: Request): Promise<Response> {
    const s = state.get(planId);
    if (!s) return notFound();
    if (!s.onEditSource) return new Response('editing disabled', { status: 405 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response('invalid JSON', { status: 400 });
    }
    const parsed = SourceEditSchema.safeParse(body);
    if (!parsed.success) return new Response('invalid edit', { status: 400 });
    try {
      const { lineDelta, plan } = s.onEditSource(parsed.data);
      s.plan = plan;
      return json({ ok: true, lineDelta });
    } catch (error) {
      return new Response(`edit failed: ${String(error)}`, { status: 500 });
    }
  }

  async function handleSubmit(planId: string, req: Request): Promise<Response> {
    const s = state.get(planId);
    if (!s) return notFound();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response('invalid JSON', { status: 400 });
    }
    const parsed = AnnotationSubmissionSchema.safeParse(body);
    if (!parsed.success) return new Response('invalid submission', { status: 400 });

    // Defer one macrotask so Bun flushes the 204 before any awaiter unblocks (matches the
    // single-plan flush trick). Only the first submission per plan counts toward allResults.
    setTimeout(() => {
      s.resolve(parsed.data);
      if (!s.done) {
        s.done = true;
        collected.set(planId, parsed.data);
        if (collected.size === state.size) resolveAll(collected);
      }
    }, 0);
    return new Response(null, { status: 204, headers: { connection: 'close' } });
  }

  const baseUrl = `http://127.0.0.1:${server.port}`;
  return {
    url: `${baseUrl}/`,
    planUrl: (planId) => `${baseUrl}/p/${planId}/`,
    resultFor: (planId) => state.get(planId)?.promise ?? Promise.reject(new Error(`unknown plan: ${planId}`)),
    allResults,
    stop: () => server.stop(true),
  };
}

function indexHtml(state: Map<string, PlanState>): string {
  const items = [...state.entries()]
    .map(([planId, s]) => `<li><a href="/p/${planId}/">${escapeHtml(s.plan.title)}</a></li>`)
    .join('\n');
  return `<!doctype html><meta charset="utf-8"><title>SmartPlan review</title>
<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:64px auto;padding:0 24px;color:#1a1814}
h1{font-size:20px}li{margin:8px 0}a{color:#b8552a}</style>
<h1>SmartPlan review — ${state.size} plan${state.size === 1 ? '' : 's'}</h1>
<ul>${items}</ul>`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
