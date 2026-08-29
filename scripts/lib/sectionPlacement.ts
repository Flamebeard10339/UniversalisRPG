import { splitSections } from '../../src/grammar/structure';

export interface Block {
  cut: { start: number; end: number };
  text: string;
}

export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let at = text.indexOf('\n'); at !== -1; at = text.indexOf('\n', at + 1)) starts.push(at + 1);
  return starts;
}

const lineTextAt = (text: string, starts: readonly number[], index: number): string =>
  text.slice(starts[index], index + 1 < starts.length ? starts[index + 1] : text.length).replace(/\r?\n$/, '');

function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return low;
}

// A section travels with the comment block written directly above it, which is where this corpus keeps what a section is for; a blank line is what separates one section's own paragraph from the heading of the group it sits under, which stays behind.
export function blockOf(text: string, starts: readonly number[], span: { start: number; end: number }): Block {
  let first = lineAt(starts, span.start);
  while (first > 0 && lineTextAt(text, starts, first - 1).trim().startsWith('//')) first -= 1;
  const last = lineAt(starts, span.end);
  const keepEnd = starts[last] + lineTextAt(text, starts, last).length;
  let after = last;
  while (after + 1 < starts.length && lineTextAt(text, starts, after + 1).trim() === '') after += 1;
  return { cut: { start: starts[first], end: after + 1 < starts.length ? starts[after + 1] : text.length }, text: text.slice(starts[first], keepEnd) };
}

// Where a section of this kind lands in a file: among the ones already of its kind, which is how both halves of a split module are laid out. A file holding none of that kind takes it at the end.
export function landing(text: string, kind: string): number {
  const held = splitSections(text).filter((section) => section.kind === kind);
  if (held.length === 0) return text.replace(/\s+$/, '').length;
  const last = blockOf(text, lineStarts(text), held[held.length - 1].span);
  return last.cut.start + last.text.length;
}

export const gap = (text: string): string => (text.includes('\r\n') ? '\r\n\r\n' : '\n\n');
