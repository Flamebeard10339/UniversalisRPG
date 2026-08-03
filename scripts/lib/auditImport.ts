import type { Severity } from './taskStore';

export interface ParsedFinding {
  code: string;
  severity: Severity;
  title: string;
  body: string;
}

const ANY_HEADING = /^## /;
// An optional short uppercase prefix (`## RG-H1`, `## CL-M6`) is the shape
// multi-auditor passes use to keep two finding lists apart in one document;
// the prefix stays in the code so the two lists cannot collide as ids.
const FINDING_HEADING = /^## ((?:[A-Z]{1,4}-)?)([HML])(\d+)\s+(.+)$/;
const SEVERITY_FOR_LETTER: Record<string, Severity> = { H: 'high', M: 'medium', L: 'low' };

// Findings under `## H1` / `## M2` / `## L3` are the load-bearing
// convention — every other heading shape (Tier 1, HIGH/MEDIUM/LOW sections,
// Findings/Non-Findings) belongs to a superseded or reconciliation document
// and is deliberately left unimported. A body still ends at the next `##`
// of ANY shape, not just the next finding — otherwise the last finding
// before a "## Verified closed" swallows it.
export function parseAuditDoc(text: string): ParsedFinding[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const headingIndexes = lines.map((line, index) => (ANY_HEADING.test(line) ? index : -1)).filter((index) => index >= 0);

  const findings: ParsedFinding[] = [];
  for (const index of headingIndexes) {
    const match = FINDING_HEADING.exec(lines[index]);
    if (!match) continue;
    const end = headingIndexes.find((candidate) => candidate > index) ?? lines.length;
    const body = trimDividers(lines.slice(index + 1, end)).join('\n');
    findings.push({ code: `${match[1]}${match[2]}${match[3]}`, severity: SEVERITY_FOR_LETTER[match[2]], title: stripLeadingDash(match[4]), body });
  }
  return findings;
}

// Almost every heading is `## H1 — title`; one in 125 is `## L6 (informational,
// not actionable) — title`, which the parser keeps as part of the title
// rather than special-casing a parenthetical it might see again differently
// shaped next time.
function stripLeadingDash(rest: string): string {
  const trimmed = rest.trim();
  return trimmed.startsWith('—') ? trimmed.slice(1).trim() : trimmed;
}

// A section is bounded by `---` rules as often as by the next heading; strip
// any leading/trailing run of blank lines and dividers so a finding's body
// starts and ends on prose.
function trimDividers(lines: string[]): string[] {
  const isDivider = (line: string): boolean => line.trim() === '' || line.trim() === '---';
  let start = 0;
  let end = lines.length;
  while (start < end && isDivider(lines[start])) start++;
  while (end > start && isDivider(lines[end - 1])) end--;
  return lines.slice(start, end);
}

const FILE_REF = /\b([A-Za-z0-9_.\/-]+\.[A-Za-z]+):(\d+)(-\d+)?\b/g;

// Best-effort text harvesting, not a real reference resolver: a bare
// mention like `save.ts:28` (no directory) is ambiguous shorthand within a
// doc's own prose, so `exists` is what tells a real path from one.
export function harvestFiles(body: string, exists: (path: string) => boolean, limit = 8): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(FILE_REF)) {
    const [, path, line, range] = match;
    if (!exists(path)) continue;
    const ref = `${path}:${line}${range ?? ''}`;
    if (seen.has(ref)) continue;
    seen.add(ref);
    found.push(ref);
    if (found.length >= limit) break;
  }
  return found;
}

const DOC_SYSTEM_PREFIXES: [prefix: string, system: string][] = [
  ['build-deployment', 'Build & deployment'],
  ['contribution-system', 'Contribution system'],
  ['dsl-load-path', 'DSL load path'],
  ['dsl-modules', 'DSL load path'],
  ['game-engine', 'Runtime'],
  ['runtime', 'Runtime'],
  ['testing-procedure', 'Testing procedure'],
  ['user-interface', 'User interface'],
];

export function systemForDoc(basename: string): string | null {
  const found = DOC_SYSTEM_PREFIXES.find(([prefix]) => basename.startsWith(`${prefix}-`));
  return found ? found[1] : null;
}
