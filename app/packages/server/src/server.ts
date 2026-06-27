import { type AnnotationSubmission, AnnotationSubmissionSchema } from '@smartplan/shared/annotationSchema';
import type { CompiledPlan } from '@smartplan/shared/planSchema';
import { z } from 'zod';

export interface ReviewServer {
  url: string;
  result: Promise<AnnotationSubmission>;
  stop: () => void;
}

export interface SourceEdit {
  pageId: string;
  startLine: number;
  endLine: number;
  text: string;
}

export interface StartReviewServerOptions {
  plan: CompiledPlan;
  /** The built single-file UI HTML. */
  html: string;
  port?: number;
  /**
   * Persist an inline edit back to the datastore. Returns how many lines the edit added/removed
   * (so the client can keep its source-line map in sync) and the recompiled plan, which becomes
   * the payload served to any later load. Omit to make the plan read-only.
   */
  onEditSource?: (edit: SourceEdit) => { lineDelta: number; plan: CompiledPlan };
}

const SourceEditSchema = z.object({
  pageId: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  text: z.string(),
});

// Ephemeral, per-review blocking server — lifted from ContextBridge's annotation server. Binds
// 127.0.0.1 on an OS-assigned port, serves the tree + UI, resolves `result` once the browser
// POSTs /submit, and (if onEditSource is provided) live-syncs inline edits to the datastore.
export function startReviewServer(options: StartReviewServerOptions): ReviewServer {
  const { plan, html, port = 0, onEditSource } = options;
  let currentPlan = plan;

  let resolveResult!: (submission: AnnotationSubmission) => void;
  const result = new Promise<AnnotationSubmission>((resolve) => {
    resolveResult = resolve;
  });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });

  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    routes: {
      '/': () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      '/payload': () => json(currentPlan),
      '/compiled-plan.json': () => json(currentPlan),
      '/source': { POST: async (req) => handleSourceEdit(req) },
      '/submit': { POST: async (req) => handleSubmit(req, resolveResult) },
    },
    fetch: () => new Response('not found', { status: 404 }),
  });

  async function handleSourceEdit(req: Request): Promise<Response> {
    if (!onEditSource) return new Response('editing disabled', { status: 405 });
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response('invalid JSON', { status: 400 });
    }
    const parsed = SourceEditSchema.safeParse(body);
    if (!parsed.success) return new Response('invalid edit', { status: 400 });
    try {
      const { lineDelta, plan: updated } = onEditSource(parsed.data);
      currentPlan = updated;
      return json({ ok: true, lineDelta });
    } catch (error) {
      return new Response(`edit failed: ${String(error)}`, { status: 500 });
    }
  }

  return {
    url: `http://127.0.0.1:${server.port}/`,
    result,
    stop: () => server.stop(true),
  };
}

async function handleSubmit(
  req: Request,
  resolveResult: (submission: AnnotationSubmission) => void,
): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('invalid JSON', { status: 400 });
  }

  const parsed = AnnotationSubmissionSchema.safeParse(body);
  if (!parsed.success) {
    return new Response('invalid submission', { status: 400 });
  }

  // Defer one macrotask so Bun flushes the 204 before the CLI tears the server down with
  // stop(true) — otherwise the browser sees a connection reset.
  setTimeout(() => resolveResult(parsed.data), 0);
  return new Response(null, { status: 204, headers: { connection: 'close' } });
}
