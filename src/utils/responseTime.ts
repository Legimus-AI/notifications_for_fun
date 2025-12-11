/**
 * Formats response time in milliseconds to human-readable format
 * @param ms - Response time in milliseconds
 * @returns Formatted string (e.g., "500 ms", "1 sec 200 ms", "2 sec")
 */
export function formatResponseTime(ms: number): string {
  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const remainingMs = ms % 1000;

  if (remainingMs === 0) {
    return seconds === 1 ? '1 sec' : `${seconds} sec`;
  }

  return `${seconds} sec ${remainingMs} ms`;
}

/**
 * Formats response time in milliseconds to human-readable format with abbreviated units
 * @param ms - Response time in milliseconds
 * @returns Formatted string (e.g., "500ms", "1.2s", "2s")
 */
export function formatResponseTimeShort(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  return `${seconds.toFixed(1)}s`;
}
