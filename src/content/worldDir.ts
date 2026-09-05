import { readdirSync, readFileSync } from 'fs';
import { WORLD_EXTENSION } from '../grammar/structure';
import type { ModuleSource } from './universe';

export const moduleIdOf = (fileName: string): string => (fileName.endsWith(WORLD_EXTENSION) ? fileName.slice(0, -WORLD_EXTENSION.length) : fileName);

export const worldFileName = (id: string): string => `${id}${WORLD_EXTENSION}`;

export function worldFileNames(dir: string): readonly string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(WORLD_EXTENSION))
    .sort((a, b) => moduleIdOf(a).localeCompare(moduleIdOf(b)));
}

export function worldModule(dir: string, id: string): ModuleSource {
  return { name: id, text: readFileSync(`${dir}/${worldFileName(id)}`, 'utf8') };
}

export function worldModules(dir: string): readonly ModuleSource[] {
  return worldFileNames(dir).map((name) => worldModule(dir, moduleIdOf(name)));
}
