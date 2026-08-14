import { isEngineKey, type EngineKey } from '../content/locale';
import { carriedName } from './carriedName';
import type { Localized, Localizer, Params } from './localized';

// A sentence the engine has settled on and has not said yet: the key, and the
// parameters it takes. What a save holds, because which words it is depends on
// who loads it, and a save is read by whoever does.
export type Said =
  // An engine pattern, whose parameters are themselves unsaid.
  | { readonly engine: EngineKey; readonly params?: Readonly<Record<string, Said>> }
  // A carried thing, named by the one rule every screen names one by: the
  // template, and the ordinal of the copy or null for one still in its stack.
  | { readonly copy: { readonly kind: string; readonly template: string; readonly ordinal: string | null } }
  // A value that is an id rather than words, and a number, which no language
  // spells with letters here.
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

// Shape only, and the key checked against the union, because a save naming a
// key this engine does not have is a save that would render as that key
// forever rather than one that is merely stale.
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
