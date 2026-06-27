import type { CompiledPlan } from '@smartplan/shared/planSchema';

// The server serves the compiled plan at /payload; in Vite dev it's a static file
// under public/. Try the server route first, then the dev fallback.
export async function loadCompiledPlan(): Promise<CompiledPlan> {
  for (const url of ['/payload', '/compiled-plan.json']) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as CompiledPlan;
    } catch {
      // try next
    }
  }
  throw new Error('could not load compiled plan from /payload or /compiled-plan.json');
}
