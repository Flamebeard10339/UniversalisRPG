import { describe, expect, it } from 'vitest';
import { checkCommitMessage, isExempt } from './commitContract';
import type { Manifest } from './systems';

describe('checkCommitMessage', () => {
  it('passes a subject and a body', () => {
    expect(checkCommitMessage('Subject line\n\nSome body explaining what was done.')).toBeNull();
  });

  it('refuses a subject-only message', () => {
    expect(checkCommitMessage('Just a subject')).toMatch(/no body/);
  });

  // The Next: trailer was retired with cmdHandoff, its only reader: a line
  // that happens to start with "Next:" is ordinary body prose now, not a
  // distinguished field excluded from the body count.
  it('counts a line starting with Next: as ordinary body content', () => {
    expect(checkCommitMessage('Subject\n\nNext: pick up X.')).toBeNull();
  });

  it('strips git-comment lines before judging', () => {
    const message = 'Subject\n\nReal body content.\n# Please enter the commit message...\n# On branch main';
    expect(checkCommitMessage(message)).toBeNull();
  });

  it('refuses an empty message', () => {
    expect(checkCommitMessage('\n\n# just comments\n')).toMatch(/empty/);
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
