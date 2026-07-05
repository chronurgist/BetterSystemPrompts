export function captureWarnings<T>(run: () => T): {
  result: T;
  warnings: unknown[][];
} {
  const originalWarn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => warnings.push(args);

  try {
    return { result: run(), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

export async function captureWarningsAsync<T>(
  run: () => Promise<T>,
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
