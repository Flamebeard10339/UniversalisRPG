export const NOTE_MARK = '@@@';

const NOTE = /[ \t]*@@@[ \t]?(?<said>.*)$/s;

export const noteIn = (text: string): string | undefined => NOTE.exec(text)?.groups?.said;

export const withoutNote = (text: string): string => text.replace(NOTE, '');

export const hasNote = (text: string): boolean => NOTE.test(text);
