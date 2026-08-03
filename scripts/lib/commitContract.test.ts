import { describe, expect, it } from 'vitest';
import { checkCommitMessage, extractNextTrailer, isExempt } from './commitContract';
import type { Manifest } from './systems';

describe('checkCommitMessage', () => {
  it('passes a subject and body, with or without a Next: trailer', () => {
    expect(checkCommitMessage('Subject line\n\nSome body explaining what was done.\n\nNext: pick up X.')).toBeNull();
    expect(checkCommitMessage('Subject line\n\nSome body explaining what was done.')).toBeNull();
  });

  it('refuses a subject-only message', () => {
    expect(checkCommitMessage('Just a subject')).toMatch(/no body/);
  });

  it('does not count the optional Next: line itself as the body', () => {
    expect(checkCommitMessage('Subject\n\nNext: only a trailer, no body.')).toMatch(/no body/);
  });

  it('strips git-comment lines before judging', () => {
    const message = 'Subject\n\nReal body content.\n\nNext: next step.\n# Please enter the commit message...\n# On branch main';
    expect(checkCommitMessage(message)).toBeNull();
  });

  it('refuses an empty message', () => {
    expect(checkCommitMessage('\n\n# just comments\n')).toMatch(/empty/);
  });

  it('finds a Next: trailer even when it is not the very last line', () => {
    const message = 'Subject\n\nBody text.\nNext: do the thing.\n\nA closing note.';
    expect(checkCommitMessage(message)).toBeNull();
  });
});

describe('extractNextTrailer', () => {
  it('returns null when the message has no Next: line', () => {
    expect(extractNextTrailer('Subject\n\nBody with no trailer.')).toBeNull();
  });

  it('captures a single-line trailer', () => {
    expect(extractNextTrailer('Subject\n\nBody.\n\nNext: pick up X.')).toBe('Next: pick up X.');
  });

  it('captures a multi-line trailer through to the end of the message, preserving line breaks', () => {
    const message = ['Subject', '', 'Body.', '', 'Next: task-system-v2-clause-1 needs either a real fix (Node version bump', 'across test.yml plus verifying every tracked script) or a deliberate call', 'that the cost is acceptable.'].join('\n');
    expect(extractNextTrailer(message)).toBe(['Next: task-system-v2-clause-1 needs either a real fix (Node version bump', 'across test.yml plus verifying every tracked script) or a deliberate call', 'that the cost is acceptable.'].join('\n'));
  });

  it('stops at the next trailer-style line rather than swallowing it', () => {
    const message = 'Subject\n\nBody.\n\nNext: pick up X.\nSigned-off-by: someone <someone@example.com>';
    expect(extractNextTrailer(message)).toBe('Next: pick up X.');
  });

  it('finds a Next: trailer even when it is not the very last line, up to the next trailer line', () => {
    const message = 'Subject\n\nBody text.\nNext: do the thing.\n\nA closing note.';
    expect(extractNextTrailer(message)).toBe('Next: do the thing.\n\nA closing note.');
  });

  it('strips git-comment lines before extracting', () => {
    const message = 'Subject\n\nBody.\n\nNext: next step.\n# Please enter the commit message...';
    expect(extractNextTrailer(message)).toBe('Next: next step.');
  });
});

const manifest: Manifest = {
  unowned: { note: '', paths: ['docs', '*.md'] },
  systems: [{ name: 'Runtime', paths: ['src/runtime'], lastAudit: null, lastAuditDoc: null, note: null, concepts: [] }],
};

describe('isExempt', () => {
  it('exempts a merge or revert regardless of subject', () => {
    expect(isExempt('Just a subject', { isMergeOrRevert: true, changedFiles: ['src/runtime/save.ts'] }, manifest)).toBe(true);
  });

  it('exempts fixup! and squash! subjects', () => {
    expect(isExempt('fixup! Earlier commit', { isMergeOrRevert: false, changedFiles: [] }, manifest)).toBe(true);
    expect(isExempt('squash! Earlier commit', { isMergeOrRevert: false, changedFiles: [] }, manifest)).toBe(true);
  });

  it('does not exempt an ordinary commit whose subject merely contains the word merge', () => {
    expect(isExempt('Merge the two validation branches of logic', { isMergeOrRevert: false, changedFiles: ['src/runtime/save.ts'] }, manifest)).toBe(false);
  });

  it('exempts a commit whose entire diff is inside unowned paths', () => {
    expect(isExempt('Update docs', { isMergeOrRevert: false, changedFiles: ['docs/specs/task-system.md', 'README.md'] }, manifest)).toBe(true);
  });

  it('does not exempt a commit that touches even one owned file', () => {
    expect(isExempt('Update docs and code', { isMergeOrRevert: false, changedFiles: ['docs/specs/task-system.md', 'src/runtime/save.ts'] }, manifest)).toBe(false);
  });

  it('does not exempt a commit with no changed files given (nothing proven unowned)', () => {
    expect(isExempt('Empty commit', { isMergeOrRevert: false, changedFiles: [] }, manifest)).toBe(false);
  });
});
