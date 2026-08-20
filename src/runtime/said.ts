import { isEngineKey, type EngineKey } from '../content/locale';
import { carriedName } from './carriedName';
import type { Localized, Localizer, Params } from './localized';

export type Said =
  | { readonly engine: EngineKey; readonly params?: Readonly<Record<string, Said>> }
  | { readonly copy: { readonly kind: string; readonly template: string; readonly ordinal: string | null } }
  | { readonly id: string }
  | { readonly count: number };

export const says = (engine: EngineKey, params?: Readonly<Record<string, Said>>): Said => (params === undefined ? { engine } : { engine, params });

export const anId = (id: string): Said => ({ id });

export const aCount = (count: number): Said => ({ count });

export const aCopy = (kind: string, template: string, ordinal: string | null = null): Said => ({ copy: { kind, template, ordinal } });

export function say(localizer: Localizer, said: Said): Localized {
  if ('id' in said) return localizer.identifier(said.id);
  if ('count' in said) return localizer.identifier(String(said.count));
  if ('copy' in said) return carriedName(localizer, said.copy.kind, said.copy.template, said.copy.ordinal);
  const params: Record<string, Localized | number> = {};
  for (const [name, value] of Object.entries(said.params ?? {})) params[name] = 'count' in value ? value.count : say(localizer, value);
  return localizer.engine(said.engine, params as Params);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function isSaid(value: unknown): value is Said {
  if (!isRecord(value)) return false;
  if ('id' in value) return typeof value.id === 'string' && Object.keys(value).length === 1;
  if ('count' in value) return typeof value.count === 'number' && Number.isFinite(value.count) && Object.keys(value).length === 1;
  if ('copy' in value) {
    const copy = value.copy;
    return (
      isRecord(copy) &&
      typeof copy.kind === 'string' &&
      typeof copy.template === 'string' &&
      (copy.ordinal === null || typeof copy.ordinal === 'string') &&
      Object.keys(copy).length === 3 &&
      Object.keys(value).length === 1
    );
  }
  if (!('engine' in value) || typeof value.engine !== 'string' || !isEngineKey(value.engine)) return false;
  if (!('params' in value)) return Object.keys(value).length === 1;
  return Object.keys(value).length === 2 && isRecord(value.params) && Object.values(value.params).every(isSaid);
}
