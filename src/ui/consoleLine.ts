export function typed(line: string): string | null {
  const trimmed = line.trim();
  return trimmed === '' ? null : trimmed;
}
