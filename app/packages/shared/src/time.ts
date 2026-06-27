export function nowIso(): string {
  return new Date().toISOString();
}

/** Format an ISO instant to second precision for agent-facing attribution lines. */
export function isoToSecond(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
