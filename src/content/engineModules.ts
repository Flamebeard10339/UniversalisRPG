import type { ModuleSource } from './universe';
import { worldFileNames, worldModule, worldModules } from './worldDir';

export const ENGINE_MODULE_DIR = 'src/content/engine';

export const engineFiles = (): readonly string[] => worldFileNames(ENGINE_MODULE_DIR);

export const engineModule = (id: string): ModuleSource => worldModule(ENGINE_MODULE_DIR, id);

export const engineModules = (): readonly ModuleSource[] => worldModules(ENGINE_MODULE_DIR);
