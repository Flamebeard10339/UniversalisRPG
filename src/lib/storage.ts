import { Preferences } from '@capacitor/preferences';

export const save = async (key: string, value: unknown) =>
  Preferences.set({ key, value: JSON.stringify(value) });

export const load = async <T>(key: string): Promise<T | null> => {
  const { value } = await Preferences.get({ key });
  return value ? (JSON.parse(value) as T) : null;
};

export const remove = (key: string) => Preferences.remove({ key });
