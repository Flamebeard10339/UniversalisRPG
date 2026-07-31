import { readFileSync } from 'node:fs';

export interface System {
  name: string;
  paths: string[];
  lastAudit: string | null;
  lastAuditDoc: string | null;
  note: string | null;
}

export interface Manifest {
  unowned: { note: string; paths: string[] };
  systems: System[];
}

export const DEFAULT_MANIFEST_PATH = 'docs/audits/systems.json';

export function loadManifest(path: string = DEFAULT_MANIFEST_PATH): Manifest {
  return JSON.parse(readFileSync(path, 'utf8')) as Manifest;
}

export function systemNames(manifest: Manifest): string[] {
  return manifest.systems.map((system) => system.name);
}

export const covers = (path: string, file: string): boolean => (path.startsWith('*.') ? file.endsWith(path.slice(1)) && !file.includes('/') : file === path || file.startsWith(`${path}/`));

export function isUnowned(manifest: Manifest, file: string): boolean {
  return manifest.unowned.paths.some((path) => covers(path, file));
}

export function owningSystem(manifest: Manifest, file: string): string | null {
  const system = manifest.systems.find((candidate) => candidate.paths.some((path) => covers(path, file)));
  return system ? system.name : null;
}
