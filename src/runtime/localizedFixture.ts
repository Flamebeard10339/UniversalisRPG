import type { Localized } from './localized';

export const asLocalized = (text: string): Localized => text as Localized;
