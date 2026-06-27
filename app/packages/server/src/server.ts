import { type AnnotationSubmission, AnnotationSubmissionSchema } from '@smartplan/shared/annotationSchema';
import type { CompiledPlan } from '@smartplan/shared/planSchema';

export interface ReviewServer {
  url: string;
  result: Promise<AnnotationSubmission>;
  stop: () => void;
}

export interface StartReviewServerOptions {
  plan: CompiledPlan;
  /** The built single-file UI HTML. */
  html: string;
  port?: number;
}

// Ephemeral, per-review blocking server — lifted from ContextBridge's annotation
// server. Binds 127.0.0.1 on an OS-assigned port, serves the tree + UI, and
// resolves `result` exactly once when the browser POSTs /submit.
export function startReviewServer(options: StartReviewServerOptions): ReviewServer {
  const { plan, html, port = 0 } = options;
  const payload = JSON.stringify(plan);

  let resolveResult!: (submission: AnnotationSubmission) => void;
  const result = new Promise<AnnotationSubmission>((resolve) => {
    resolveResult = resolve;
  });

  const json = (body: string) =>
    new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

  const server = Bun.serve({
    port,
    hostname: '127.0.0.1',
    routes: {
      '/': () => new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
      '/payload': () => json(payload),
      '/compiled-plan.json': () => json(payload),
      '/submit': {
        POST: async (req) => handleSubmit(req, resolveResult),
      },
    },
    fetch: () => new Response('not found', { status: 404 }),
  });

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

  // Defer one macrotask so Bun flushes the 204 before the CLI tears the server
  // down with stop(true) — otherwise the browser sees a connection reset.
  setTimeout(() => resolveResult(parsed.data), 0);
  return new Response(null, { status: 204, headers: { connection: 'close' } });
}
