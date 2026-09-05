const WORN = 'worn:';

export const WORN_COPY = `${WORN}[a-z][a-z0-9-]*`;

export const wornCopy = (slot: string): string => `${WORN}${slot}`;

export const wornCopySlot = (id: string): string | undefined => (id.startsWith(WORN) ? id.slice(WORN.length) : undefined);
