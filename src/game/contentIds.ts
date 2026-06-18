export const toKebabCase = (value: string) =>
  value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const toKebabInput = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-{2,}/g, '-');

export const locationTitleKey = (id: string) => `location.${toKebabCase(id)}.title`;
export const locationDescriptionKey = (id: string) => `location.${toKebabCase(id)}.description`;
export const actionTitleKey = (id: string) => `action.${toKebabCase(id)}.title`;
export const actionDescriptionKey = (id: string) => `action.${toKebabCase(id)}.description`;
export const actionSuccessKey = (id: string) => `action.${toKebabCase(id)}.success`;
export const actionFailureKey = (id: string) => `action.${toKebabCase(id)}.failure`;
export const actionKillKey = (id: string) => `action.${toKebabCase(id)}.kill`;
export const skillTitleKey = (id: string) => `skill.${toKebabCase(id)}.title`;
export const skillDescriptionKey = (id: string) => `skill.${toKebabCase(id)}.description`;
export const itemTitleKey = (id: string) => `item.${toKebabCase(id)}.title`;
export const itemDescriptionKey = (id: string) => `item.${toKebabCase(id)}.description`;
export const edgeId = (source: string, target: string) => `${toKebabCase(source)}-${toKebabCase(target)}`;
