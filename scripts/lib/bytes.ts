// Agents corrupt files in one recurring shape: a NUL or an invalid UTF-8
// sequence lands mid-file, grep starts treating the file as binary, and
// every downstream tool sees it before any human does. This answers "is
// every tracked text file still text" as a pure decision over bytes the
// caller supplies.

export interface ByteFinding {
  file: string;
  issue: string;
}

// Extensions this repo tracks that are text by contract. A file outside the
// list is not checked — a keystore or an icon is allowed to be bytes.
const TEXT_EXTENSIONS = new Set(['ts', 'tsx', 'js', 'mjs', 'cjs', 'json', 'jsonl', 'md', 'yml', 'yaml', 'css', 'html', 'dsl', 'txt', 'sh', 'cmd', 'xml', 'gradle', 'properties']);

export function isCheckedTextFile(file: string): boolean {
  const dot = file.lastIndexOf('.');
  if (dot === -1) return false;
  return TEXT_EXTENSIONS.has(file.slice(dot + 1).toLowerCase());
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

export function checkFileBytes(file: string, bytes: Uint8Array): ByteFinding | null {
  const nul = bytes.indexOf(0);
  if (nul !== -1) return { file, issue: `NUL byte at offset ${nul} — grep treats this file as binary` };
  try {
    utf8.decode(bytes);
  } catch {
    return { file, issue: 'not valid UTF-8' };
  }
  return null;
}

// The whole answer for a file list, with reading passed in as data so the
// decision is testable without a filesystem.
export function checkBytes(files: string[], read: (file: string) => Uint8Array | null): ByteFinding[] {
  const findings: ByteFinding[] = [];
  for (const file of files) {
    if (!isCheckedTextFile(file)) continue;
    const bytes = read(file);
    if (bytes === null) continue;
    const finding = checkFileBytes(file, bytes);
    if (finding !== null) findings.push(finding);
  }
  return findings;
}
