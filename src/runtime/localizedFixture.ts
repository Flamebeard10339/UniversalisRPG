import type { Localized } from './localized';

// A stand-in for text the localizer would have produced, for a test that builds
// a view by hand rather than playing one. It is the one way to make a
// `Localized` without a localizer, which is why it lives in a file named for
// what it is and why `localized.test.ts` proves nothing outside a test imports
// it — a brand is only closed while that stays true.
export const asLocalized = (text: string): Localized => text as Localized;
