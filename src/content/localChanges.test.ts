import { describe, expect, it } from 'vitest';
import { deleteLocalSection, initialLocalChangesModule, listLocalSections, localSectionHeadings, upsertLocalSection } from './localChanges';

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

  it('keeps every header line the file owns, in place, across an edit and a delete', () => {
    // A header this caller did not write and could not reconstruct: a version
    // it does not know, a pack it does not know, a language it would have
    // defaulted, and all of it either side of the one declaration it shares.
    const foreign = ['# info local-changes', 'version: 3.2.1', 'pack: shared', 'dependencies:', '  base', '  extra', 'language: fr', '', '# item gem', 'title: Gem', ''].join('\n');
    const header = (text: string): string[] => text.split('\n').slice(0, 7);

    const staged = upsertLocalSection(foreign, ['base'], '# item ruby\ntitle: Ruby\n');
    expect(header(staged.text)).toEqual(['# info local-changes', 'version: 3.2.1', 'pack: shared', 'dependencies:', '  base', '  extra', 'language: fr']);
    expect(localSectionHeadings(staged.text)).toEqual(['# item gem', '# item ruby']);

    const deleted = deleteLocalSection(staged.text, ['base'], 'item', 'gem');
    expect(header(deleted.text)).toEqual(header(foreign));
    expect(localSectionHeadings(deleted.text)).toEqual(['# item ruby']);
  });

  it('adds the modules the caller needs and the file does not name, keeping the file’s own spelling of the rest', () => {
    const foreign = ['# info local-changes', 'dependencies:', '  ? extra', '  base >= 1.2', ''].join('\n');

    const staged = upsertLocalSection(foreign, ['base', 'extra', 'tutorial'], '# item gem\ntitle: Gem\n');

    // `? extra` and `base >= 1.2` are statements a caller holding a list of
    // loaded ids cannot make, so they stand; `tutorial` is one only the caller
    // knows about, so it is added plainly and nothing is dropped.
    expect(staged.text.split('\n').slice(0, 5)).toEqual(['# info local-changes', 'dependencies:', '  ? extra', '  base >= 1.2', '  tutorial']);
  });

  it('reads an inline dependency list as readily as a block one', () => {
    const inline = ['# info local-changes', 'dependencies: base, ? extra', ''].join('\n');
    const staged = upsertLocalSection(inline, ['base', 'tutorial'], '# item gem\ntitle: Gem\n');
    expect(staged.text.split('\n').slice(0, 5)).toEqual(['# info local-changes', 'dependencies:', '  base', '  ? extra', '  tutorial']);
  });

  it('names the module local-changes whatever the file called it, because the sections land under that name', () => {
    const foreign = ['# info some-other-module', 'version: 1.0.0', ''].join('\n');
    const staged = upsertLocalSection(foreign, ['base'], '# item ruby\ntitle: Ruby\n');
    expect(staged.text.split('\n').slice(0, 2)).toEqual(['# info local-changes', 'version: 1.0.0']);
  });

  it('renders a header from the dependency list only for a source that has none', () => {
    const staged = upsertLocalSection('', ['base'], '# item gem\ntitle: Gem\n');
    expect(staged.text.split('\n').slice(0, 5)).toEqual(['# info local-changes', 'version: 0.0.0', 'pack: local', 'dependencies:', '  base']);
  });

  // A delete is an edit to a file the author is still in, so the header stands
  // — including a declaration this caller could not have written. Clearing is
  // not an edit and no longer lives here at all: it reads nothing, so there is
  // no source for it to preserve anything out of.
  it('keeps the header across a delete of the last section', () => {
    // A header the renderer would not produce, so that "kept" and "rebuilt"
    // are distinguishable at all — over a file this caller wrote, they are the
    // same text and the comparison below could not tell them apart.
    const foreign = ['# info local-changes', 'version: 3.2.1', 'pack: shared', 'dependencies:', '  base', '  gone-in-this-release', '', '# item gem', 'title: Gem', ''].join('\n');

    const deleted = deleteLocalSection(foreign, ['base'], 'item', 'gem').text;

    expect(localSectionHeadings(deleted)).toEqual([]);
    expect(deleted).toContain('version: 3.2.1');
    expect(deleted).toContain('gone-in-this-release');
  });

  it('preserves section text when a file starts with a UTF-8 BOM', () => {
    const source = `\uFEFF${initialLocalChangesModule(['base'])}\n# item gem\ntitle: Gem\n`;
    expect(listLocalSections(source)[0]).toEqual({ kind: 'item', id: 'gem', text: '# item gem\ntitle: Gem' });
  });
});
