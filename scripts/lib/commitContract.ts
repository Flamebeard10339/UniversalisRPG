import { isUnowned, type Manifest } from './systems';

export interface Exemption {
  isMergeOrRevert: boolean;
  changedFiles: string[];
}

const FIXUP_OR_SQUASH = /^(fixup|squash)!\s/;

// Merges and reverts are detected by the caller from .git/MERGE_HEAD and
// .git/REVERT_HEAD, not by guessing at the subject line — an ordinary
// commit someone happens to title "Merge the two branches of logic" must
// not slip through as exempt.
export function isExempt(subject: string, exemption: Exemption, manifest: Manifest): boolean {
  if (exemption.isMergeOrRevert) return true;
  if (FIXUP_OR_SQUASH.test(subject)) return true;
  return exemption.changedFiles.length > 0 && exemption.changedFiles.every((file) => isUnowned(manifest, file));
}

const NEXT_TRAILER = /^Next:\s*(.+)$/;

// git leaves `#`-prefixed comment lines (the "Please enter the commit
// message..." scaffold) in the message file; those aren't content.
function contentLines(message: string): string[] {
  const lines = message.split('\n').filter((line) => !line.startsWith('#'));
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
  return lines;
}

// Returns a refusal reason, or null if the message satisfies the contract:
// a body (at least one line past the subject). Next: is an optional
// breadcrumb that `tasks handoff` can surface, not the source of truth.
export function checkCommitMessage(message: string): string | null {
  const lines = contentLines(message);
  if (lines.length === 0) return 'commit message is empty';

  const body = lines.slice(1).filter((line) => line.trim() !== '' && !NEXT_TRAILER.test(line.trim()));
  if (body.length === 0) return 'commit message has no body — at least one line past the subject, saying what was done';

  return null;
}

// A trailer-style line: a bare token immediately followed by `: `, matching
// git's own trailer convention (Next:, Signed-off-by:, Co-Authored-By: ...).
const TRAILER_LINE = /^[A-Za-z][\w-]*:\s+\S/;

// The whole Next: trailer, from its opening line through to the end of the
// message or the next trailer-style line — whichever comes first —
// preserving the author's line breaks rather than collapsing wrapped prose
// into one sentence the way proof-clause parsing does. Returns null when
// the message carries no Next: line at all.
export function extractNextTrailer(message: string): string | null {
  const lines = contentLines(message);
  const start = lines.findIndex((line) => NEXT_TRAILER.test(line.trim()));
  if (start === -1) return null;
  const stop = lines.findIndex((line, index) => index > start && TRAILER_LINE.test(line.trim()));
  const end = stop === -1 ? lines.length : stop;
  return lines.slice(start, end).join('\n').trim();
}
