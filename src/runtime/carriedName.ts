import type { Localized, Localizer } from './localized';

export function carriedName(localizer: Localizer, kind: string, template: string, copy: string | null): Localized {
  const title = localizer.words(kind, template, 'title');
  if (title === undefined) return copy === null ? localizer.title(kind, template) : localizer.identifier(`${template}#${copy}`);
  return title;
}
