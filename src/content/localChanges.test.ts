import { describe, expect, it } from 'vitest';
import { clearLocalSections, deleteLocalSection, initialLocalChangesModule, listLocalSections, localSectionHeadings, upsertLocalSection } from './localChanges';

describe('local-changes module text helpers', () => {
  it('renders a managed header with sorted dependencies', () => {
    const text = initialLocalChangesModule(['tutorial', 'base']);
    expect(text.split('\n').slice(0, 6)).toEqual(['# info local-changes', 'version: 0.0.0', 'pack: local', 'dependencies:', '  base', '  tutorial']);
  });

  it('upserts one section by kind and id while preserving the other staged sections', () => {
    let text = initialLocalChangesModule(['base']);
    text = upsertLocalSection(text, ['base'], '# item gem\ntitle: Gem\n').text;
    text = upsertLocalSection(text, ['base'], '# entity sprite\ntitle: Sprite\n').text;
    const edited = upsertLocalSection(text, ['base'], '# item gem\ntitle: Ruby\n');

    expect(edited.replaced).toBe(true);
    expect(localSectionHeadings(edited.text)).toEqual(['# item gem', '# entity sprite']);
    expect(edited.text).toContain('title: Ruby');
    expect(edited.text).not.toContain('title: Gem');
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

  it('carries across the `# info` the source already has, so an edit rewrites only its sections', () => {
    // A header this caller did not write and could not reconstruct: a version
    // it does not know, a pack it does not know, and a dependency missing from
    // the list it was handed.
    const foreign = ['# info local-changes', 'version: 3.2.1', 'pack: shared', 'dependencies:', '  base', '  extra', '', '# item gem', 'title: Gem', ''].join('\n');

    const staged = upsertLocalSection(foreign, ['base'], '# item ruby\ntitle: Ruby\n');
    expect(staged.text.split('\n').slice(0, 6)).toEqual(['# info local-changes', 'version: 3.2.1', 'pack: shared', 'dependencies:', '  base', '  extra']);
    expect(localSectionHeadings(staged.text)).toEqual(['# item gem', '# item ruby']);

    const deleted = deleteLocalSection(staged.text, ['base'], 'item', 'gem');
    expect(deleted.text.split('\n').slice(0, 6)).toEqual(['# info local-changes', 'version: 3.2.1', 'pack: shared', 'dependencies:', '  base', '  extra']);
    expect(localSectionHeadings(deleted.text)).toEqual(['# item ruby']);
  });

  it('renders a header from the dependency list only for a source that has none', () => {
    const staged = upsertLocalSection('', ['base'], '# item gem\ntitle: Gem\n');
    expect(staged.text.split('\n').slice(0, 5)).toEqual(['# info local-changes', 'version: 0.0.0', 'pack: local', 'dependencies:', '  base']);
  });

  it('clears back to only the managed module header', () => {
    const cleared = clearLocalSections(['base']);
    expect(localSectionHeadings(cleared)).toEqual([]);
    expect(cleared).toContain('# info local-changes');
  });

  it('preserves section text when a file starts with a UTF-8 BOM', () => {
    const source = `\uFEFF${initialLocalChangesModule(['base'])}\n# item gem\ntitle: Gem\n`;
    expect(listLocalSections(source)[0]).toEqual({ kind: 'item', id: 'gem', text: '# item gem\ntitle: Gem' });
  });
});
