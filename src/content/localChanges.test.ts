import { describe, expect, it } from 'vitest';
import { clearLocalSections, deleteLocalSection, initialLocalChangesModule, localSectionHeadings, upsertLocalSection } from './localChanges';

describe('local-changes module text helpers', () => {
  it('renders a managed header with sorted dependencies', () => {
    const text = initialLocalChangesModule(['tutorial', 'base']);
    expect(text.split('\n').slice(0, 6)).toEqual(['# info local-changes', 'version: 0.0.0', 'pack: local', 'dependencies:', '  base', '  tutorial']);
  });

  it('upserts one section by kind and id while preserving the other staged sections', () => {
    let text = initialLocalChangesModule(['base']);
    text = upsertLocalSection(text, ['base'], '# item gem\ntitle: Gem\n').text;
    const edited = upsertLocalSection(text, ['base'], '# item gem\ntitle: Ruby\n');
    text = upsertLocalSection(edited.text, ['base'], '# entity sprite\ntitle: Sprite\n').text;

    expect(edited.replaced).toBe(true);
    expect(localSectionHeadings(text)).toEqual(['# item gem', '# entity sprite']);
    expect(text).toContain('title: Ruby');
    expect(text).not.toContain('title: Gem');
  });

  it('deletes one staged section and reports misses without changing the module', () => {
    let text = initialLocalChangesModule(['base']);
    text = upsertLocalSection(text, ['base'], '# item gem\ntitle: Gem\n').text;

    const missing = deleteLocalSection(text, ['base'], 'entity', 'gem');
    expect(missing.deleted).toBe(false);
    expect(missing.text).toBe(text);

    const deleted = deleteLocalSection(text, ['base'], 'item', 'gem');
    expect(deleted.deleted).toBe(true);
    expect(localSectionHeadings(deleted.text)).toEqual([]);
  });

  it('clears back to only the managed module header', () => {
    const cleared = clearLocalSections(['base']);
    expect(localSectionHeadings(cleared)).toEqual([]);
    expect(cleared).toContain('# info local-changes');
  });
});
