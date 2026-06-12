/**
 * ClearRoute performance monitoring utilities.
 * Wraps the Performance API for measuring key user-facing operations.
 */

const MARK_PREFIX = "clearroute:";

type PerfMark =
  | "app:mount"
  | "quotes:fetch-start"
  | "quotes:fetch-end"
  | "quotes:render"
  | "decision:compute"
  | "wallet:connect-start"
  | "wallet:connect-end"
  | "swap:refresh"
  | "swap:build"
  | "swap:sign"
  | "swap:submit"
  | "swap:confirmed";

export function mark(name: PerfMark): void {
  if (typeof performance !== "undefined" && performance.mark) {
    performance.mark(`${MARK_PREFIX}${name}`);
  }
}

export function measure(
  name: string,
  startMark: PerfMark,
  endMark: PerfMark,
): PerformanceMeasure | undefined {
  if (typeof performance !== "undefined" && performance.measure) {
    try {
      return performance.measure(
        `${MARK_PREFIX}${name}`,
        `${MARK_PREFIX}${startMark}`,
        `${MARK_PREFIX}${endMark}`,
      );
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * High-resolution timing wrapper for async operations.
 * Reports duration to console in development.
 */
export async function timeAsync<T>(
  label: PerfMark,
  fn: () => Promise<T>,
): Promise<T> {
  mark(label as PerfMark);
  const start = typeof performance !== "undefined" ? performance.now() : 0;
  try {
    const result = await fn();
    const duration = typeof performance !== "undefined" ? performance.now() - start : 0;
    if (import.meta.env.DEV && duration > 500) {
      console.warn(`[perf] ${label} took ${duration.toFixed(0)}ms`);
    }
    return result;
  } catch (error) {
    const duration = typeof performance !== "undefined" ? performance.now() - start : 0;
    console.error(`[perf] ${label} failed after ${duration.toFixed(0)}ms`, error);
    throw error;
  }
}

/**
 * Log a custom metric to the console in development mode.
 */
export function logMetric(name: string, value: number, unit = "ms"): void {
  if (import.meta.env.DEV) {
    console.debug(`[perf] ${name}: ${value.toFixed(1)}${unit}`);
  }
}

/**
 * Observe Core Web Vitals using the web-vitals API if available.
 * Reports LCP, FID, CLS to console in development.
 */
export function observeWebVitals(): void {
  if (typeof window === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (import.meta.env.DEV) {
          console.debug(`[perf] web-vital:${entry.name} = ${(entry as PerformanceEntry & { value: number }).value.toFixed(1)}`);
        }
      }
    });
    observer.observe({ type: "largest-contentful-paint", buffered: true });
    observer.observe({ type: "first-input", buffered: true });
    observer.observe({ type: "layout-shift", buffered: true });
  } catch {
    // PerformanceObserver not available
  }
}
