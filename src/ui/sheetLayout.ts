export type Layout = 'list' | 'grid';

// The one grid every dense page is laid out on: as many columns of at least 6rem as the width
// affords. A page that wants this shape takes it from here rather than writing the columns again.
export const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] gap-3';
