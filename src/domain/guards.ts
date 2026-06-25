export function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${String(value)}`);
}

export function ensureString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value.trim();
}
