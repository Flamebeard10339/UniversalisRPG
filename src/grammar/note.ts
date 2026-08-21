// A note an author leaves in a player-facing string: what is written is rough, or what was asked for is not something the engine can do yet. The engine drops it; the corpus keeps it, so it can be read back as a list of what is unfinished.
export const NOTE_MARK = '@@@';

const NOTE = /[ \t]*@@@[ \t]?(?<said>.*)$/s;

// What an author left, or nothing where they left none. A bare mark says only that the writing is rough, and comes back as the empty string rather than as nothing at all.
export const noteIn = (text: string): string | undefined => NOTE.exec(text)?.groups?.said;

export const withoutNote = (text: string): string => text.replace(NOTE, '');

export const hasNote = (text: string): boolean => NOTE.test(text);
