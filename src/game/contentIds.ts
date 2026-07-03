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
export const universeTitleKey = (id: string) => `universe.${toKebabCase(id)}.title`;
export const universeDescriptionKey = (id: string) => `universe.${toKebabCase(id)}.description`;
export const locationDescriptionKey = (id: string) => `location.${toKebabCase(id)}.description`;
export const locationExhaustedKey = (id: string) => `location.${toKebabCase(id)}.exhausted`;
export const entityTitleKey = (id: string) => `entity.${toKebabCase(id)}.title`;
export const entityDescriptionKey = (id: string) => `entity.${toKebabCase(id)}.description`;
export const actionTitleKey = (id: string) => `action.${toKebabCase(id)}.title`;
export const actionDescriptionKey = (id: string) => `action.${toKebabCase(id)}.description`;
export const actionSuccessKey = (id: string) => `action.${toKebabCase(id)}.success`;
export const actionFailureKey = (id: string) => `action.${toKebabCase(id)}.failure`;
export const actionKillKey = (id: string) => `action.${toKebabCase(id)}.kill`;
export const interactionPlayerHitKey = (id: string) => `interaction.${toKebabCase(id)}.player.hit`;
export const interactionPlayerMissKey = (id: string) => `interaction.${toKebabCase(id)}.player.miss`;
export const interactionPlayerKillKey = (id: string) => `interaction.${toKebabCase(id)}.player.kill`;
export const interactionEntityHitKey = (id: string) => `interaction.${toKebabCase(id)}.entity.hit`;
export const interactionEntityMissKey = (id: string) => `interaction.${toKebabCase(id)}.entity.miss`;
export const interactionEntityKillKey = (id: string) => `interaction.${toKebabCase(id)}.entity.kill`;
export const interactionTitleKey = (id: string) => `interaction.${toKebabCase(id)}.title`;
export const skillTitleKey = (id: string) => `skill.${toKebabCase(id)}.title`;
export const skillDescriptionKey = (id: string) => `skill.${toKebabCase(id)}.description`;
export const statTitleKey = (id: string) => `stat.${toKebabCase(id)}.title`;
export const statDescriptionKey = (id: string) => `stat.${toKebabCase(id)}.description`;
export const resourceTitleKey = (id: string) => `resource.${toKebabCase(id)}.title`;
export const effectTitleKey = (id: string) => `effect.${toKebabCase(id)}.title`;
export const itemTitleKey = (id: string) => `item.${toKebabCase(id)}.title`;
export const itemDescriptionKey = (id: string) => `item.${toKebabCase(id)}.description`;
export const edgeId = (source: string, target: string) => `${toKebabCase(source)}-${toKebabCase(target)}`;
