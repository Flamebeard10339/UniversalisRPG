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

const toLocalizationId = (value: string) =>
  value
    .split('.')
    .map(toKebabCase)
    .filter(Boolean)
    .join('.');

export const locationTitleKey = (id: string) => `location.${toKebabCase(id)}.title`;
export const universeTitleKey = (id: string) => `universe.${toKebabCase(id)}.title`;
export const universeDescriptionKey = (id: string) => `universe.${toKebabCase(id)}.description`;
export const locationExamineKey = (id: string) => `location.${toKebabCase(id)}.examine`;
export const locationExhaustedKey = (id: string) => `location.${toKebabCase(id)}.exhausted`;
export const entityTitleKey = (id: string) => `entity.${toKebabCase(id)}.title`;
export const entityDescriptionKey = (id: string) => `entity.${toKebabCase(id)}.description`;
export const actionTitleKey = (id: string) => `action.${toLocalizationId(id)}.title`;
export const actionDescriptionKey = (id: string) => `action.${toLocalizationId(id)}.description`;
export const actionSuccessKey = (id: string) => `action.${toLocalizationId(id)}.success`;
export const actionFailureKey = (id: string) => `action.${toLocalizationId(id)}.failure`;
export const actionKillKey = (id: string) => `action.${toLocalizationId(id)}.kill`;
export const interactionPlayerHitKey = (id: string) => `interaction.${toKebabCase(id)}.player.hit`;
export const interactionPlayerMissKey = (id: string) => `interaction.${toKebabCase(id)}.player.miss`;
export const interactionPlayerKillKey = (id: string) => `interaction.${toKebabCase(id)}.player.kill`;
export const interactionEntityHitKey = (id: string) => `interaction.${toKebabCase(id)}.entity.hit`;
export const interactionEntityMissKey = (id: string) => `interaction.${toKebabCase(id)}.entity.miss`;
export const interactionEntityKillKey = (id: string) => `interaction.${toKebabCase(id)}.entity.kill`;
export const interactionTitleKey = (id: string) => `interaction.${toKebabCase(id)}.title`;
export const skillTitleKey = (id: string) => `skill.${toKebabCase(id)}.title`;
export const skillExamineKey = (id: string) => `skill.${toKebabCase(id)}.examine`;
export const statTitleKey = (id: string) => `stat.${toKebabCase(id)}.title`;
export const statExamineKey = (id: string) => `stat.${toKebabCase(id)}.examine`;
export const resourceTitleKey = (id: string) => `resource.${toKebabCase(id)}.title`;
export const effectTitleKey = (id: string) => `effect.${toKebabCase(id)}.title`;
export const itemTitleKey = (id: string) => `item.${toKebabCase(id)}.title`;
