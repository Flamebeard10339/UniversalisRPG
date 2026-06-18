export const skillLevelFromXp = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 10)) + 1;
