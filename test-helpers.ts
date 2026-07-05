export async function captureWarnings<T>(
  run: () => T | Promise<T>,
): Promise<{ result: T; warnings: unknown[][] }> {
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    return { result: await run(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}
