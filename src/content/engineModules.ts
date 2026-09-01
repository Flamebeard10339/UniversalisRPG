import { readdirSync, readFileSync } from 'fs';
import type { ModuleSource } from './universe';

export const ENGINE_MODULE_DIR = 'src/content/engine';

const moduleId = (fileName: string): string => fileName.replace(/\.dsl$/, '');

export function engineFiles(): readonly string[] {
  return readdirSync(ENGINE_MODULE_DIR)
    .filter((name) => name.endsWith('.dsl'))
    .sort((a, b) => moduleId(a).localeCompare(moduleId(b)));
}

export function engineModule(id: string): ModuleSource {
  return { name: id, text: readFileSync(`${ENGINE_MODULE_DIR}/${id}.dsl`, 'utf8') };
}

export function engineModules(): readonly ModuleSource[] {
  return engineFiles().map((file) => engineModule(moduleId(file)));
}
