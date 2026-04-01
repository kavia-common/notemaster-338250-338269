"use client";

import { useCallback, useEffect, useRef } from "react";

type DebouncedFn<TArgs extends unknown[]> = (...args: TArgs) => void;

/**
 * Returns a stable function that delays invoking `fn` until `delayMs` has passed
 * without any new calls.
 */
export function useDebouncedCallback<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number
): DebouncedFn<TArgs> {
  const fnRef = useRef(fn);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return useCallback(
    (...args: TArgs) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        fnRef.current(...args);
      }, delayMs);
    },
    [delayMs]
  );
}
