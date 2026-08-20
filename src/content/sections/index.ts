import { item } from './item.oop';
import { passive } from './passive.oop';
import { AnySection } from './section.oop';

// Every section kind there is. Written out rather than globbed, because a glob
// is `import.meta.glob` and that exists only under Vite — the node-side tools
// (`inspect`, `probe`, `play-cli`) import this too, and a registry they cannot
// load is worse than one somebody has to add a line to.
//
// The line is not left to be remembered: `section.test.ts` globs this directory
// and fails on any kind that exports a section and is not here, which is the
// same guarantee with the cost moved to a place that can afford it.
export const SECTIONS: readonly AnySection[] = [item, passive];

// The kind by name, for a caller that has read a heading and wants the section
// that answers for it.
export const sectionFor = (kind: string): AnySection | undefined => SECTIONS.find((section) => section.kind === kind);
