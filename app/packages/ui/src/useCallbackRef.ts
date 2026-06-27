import { useEffect, useRef } from 'react';

// Stable-identity callback that always invokes the latest closure. Lets event
// listeners bind once without going stale. (Correctness tool, not memoization.)
export function useCallbackRef<Args extends unknown[], Return>(
  fn: (...args: Args) => Return,
): (...args: Args) => Return {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  const stable = useRef((...args: Args): Return => ref.current(...args));
  return stable.current;
}
