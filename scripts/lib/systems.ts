import { existsSync, readFileSync } from 'node:fs';

// A concept is one thing a system knows how to do, named so that "does
// anything already do this" is a query instead of a guess. It refines its
// system rather than partitioning the tree a third time alongside layers and
// systems: its paths are a subset of its system's, so membership resolves
// against one relation that cannot disagree with itself.
export interface Concept {
  name: string;
  paths: string[];
  // Where the name came from — a `produces` claim, an audit finding. A
  // concept nobody can source is a name invented for coverage, and the
  // duplication query then answers "no owner" with confidence.
  note: string | null;
}

export interface System {
  name: string;
  paths: string[];
  lastAudit: string | null;
  lastAuditDoc: string | null;
  note: string | null;
  concepts: Concept[];
}

export interface Manifest {
  unowned: { note: string; paths: string[] };
  systems: System[];
}

export class ManifestError extends Error {}

export const DEFAULT_MANIFEST_PATH = 'docs/audits/systems.json';

export const covers = (path: string, file: string): boolean => (path.startsWith('*.') ? file.endsWith(path.slice(1)) && !file.includes('/') : file === path || file.startsWith(`${path}/`));

// Compared lowercase, and this is the one place that rule lives. On Linux
// `Foo.ts` and `foo.ts` are two files and on Windows — this repo's primary
// platform — they are one, so a case-sensitive comparison misses a real
// collision on the machine most of this work happens on. `covers` itself
// stays case-sensitive: it answers about paths git produced, which are
// already canonical, while everything routed through here compares regions
// somebody typed by hand.
export function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
}

// Containment in either direction. Two declared regions intersect when one
// contains the other, which is the same question whether the regions are two
// workers' write grants or two concepts' path lists — so it is answered here
// once rather than reimplemented per caller.
export function pathsOverlap(a: string, b: string): boolean {
  const [x, y] = [normalizePath(a), normalizePath(b)];
  return covers(x, y) || covers(y, x);
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new ManifestError(`${where}: expected an object`);
  return value as Record<string, unknown>;
}

function asString(record: Record<string, unknown>, key: string, where: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new ManifestError(`${where}: ${key} must be a string`);
  return value;
}

function asStringArray(record: Record<string, unknown>, key: string, where: string): string[] {
  const value = record[key];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new ManifestError(`${where}: ${key} must be an array of strings`);
  return value as string[];
}

function asNullableString(record: Record<string, unknown>, key: string, where: string): string | null {
  const value = record[key] ?? null;
  if (value !== null && typeof value !== 'string') throw new ManifestError(`${where}: ${key} must be a string or null`);
  return value;
}

// Absent means none, so a system written before concepts existed still
// parses; present but the wrong shape is still malformed, so a typo is not
// silently an empty list.
function parseConcepts(system: Record<string, unknown>, where: string): Concept[] {
  const value = system.concepts;
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new ManifestError(`${where}: concepts must be an array`);
  return value.map((entry, index) => {
    const at = `${where}: concept ${index + 1}`;
    const concept = asRecord(entry, at);
    return { name: asString(concept, 'name', at), paths: asStringArray(concept, 'paths', at), note: asNullableString(concept, 'note', at) };
  });
}

// Shape is refused; meaning is reported. A manifest that will not parse is
// malformed input, the one thing this repo's tools refuse — everything a
// reader could still answer around goes to `checkManifest` instead.
export function parseManifest(text: string, label: string): Manifest {
  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch (error) {
    throw new ManifestError(`${label}: ${(error as Error).message}`);
  }
  const root = asRecord(raw, label);
  const unowned = asRecord(root.unowned ?? {}, `${label}: unowned`);
  const systems = root.systems;
  if (!Array.isArray(systems)) throw new ManifestError(`${label}: systems must be an array`);

  return {
    unowned: { note: typeof unowned.note === 'string' ? unowned.note : '', paths: asStringArray(unowned, 'paths', `${label}: unowned`) },
    systems: systems.map((entry, index) => {
      const at = `${label}: system ${index + 1}`;
      const system = asRecord(entry, at);
      const name = asString(system, 'name', at);
      const where = `${label}: ${name}`;
      return {
        name,
        paths: asStringArray(system, 'paths', where),
        lastAudit: asNullableString(system, 'lastAudit', where),
        lastAuditDoc: asNullableString(system, 'lastAuditDoc', where),
        note: asNullableString(system, 'note', where),
        concepts: parseConcepts(system, where),
      };
    }),
  };
}

export function loadManifest(path: string = DEFAULT_MANIFEST_PATH): Manifest {
  return parseManifest(readFileSync(path, 'utf8'), path);
}

export function systemNames(manifest: Manifest): string[] {
  return manifest.systems.map((system) => system.name);
}

export function isUnowned(manifest: Manifest, file: string): boolean {
  return manifest.unowned.paths.some((path) => covers(path, file));
}

// The most specific declaration that covers this file. Specificity is the
// declared path's length, which is what makes an exact file beat the
// directory containing it — the routing-table rule.
function bestClaim(system: System, file: string): number | null {
  const lengths = system.paths.filter((path) => covers(path, file)).map((path) => path.length);
  return lengths.length === 0 ? null : Math.max(...lengths);
}

export interface Ownership {
  system: System;
  // Every other system whose declaration is exactly as specific. Empty in a
  // manifest with no ties, which is the state `checkManifest` asks for.
  tiedWith: System[];
}

// Ownership is single-valued: one file, one system, and the answer does not
// move when entries are reordered in the manifest. That is what makes
// "which files are in this system" answerable — `covers` alone says only
// that *a* system claims it, and eleven files here are claimed by two.
//
// A tie is broken by system name so the resolution is still independent of
// array order. The tie-break is arbitrary and the tie itself is a defect, so
// it is carried on the result rather than hidden: `checkManifest` reports it.
export function ownerOf(manifest: Manifest, file: string): Ownership | null {
  const claims = manifest.systems.map((system) => ({ system, at: bestClaim(system, file) })).filter((claim): claim is { system: System; at: number } => claim.at !== null);
  if (claims.length === 0) return null;
  const best = Math.max(...claims.map((claim) => claim.at));
  const [system, ...tiedWith] = claims
    .filter((claim) => claim.at === best)
    .map((claim) => claim.system)
    .sort((a, b) => a.name.localeCompare(b.name));
  return { system, tiedWith };
}

export function owningSystem(manifest: Manifest, file: string): string | null {
  return ownerOf(manifest, file)?.system.name ?? null;
}

// The other, weaker relation: every system whose audit window includes this
// file. Deliberately many-to-many — two auditors reading one file is
// redundancy, not a hole, and `systems.json` says so about `src/content`.
// Kept apart from ownership so that making membership single-valued does not
// silently shrink anybody's window.
export function coveringSystems(manifest: Manifest, file: string): string[] {
  return manifest.systems.filter((system) => system.paths.some((path) => covers(path, file))).map((system) => system.name);
}

// Every concept of this system that claims the file. Not single-valued on
// purpose: two concepts claiming one file is the signal that the file does
// two jobs, so the overlap is the answer rather than something to resolve.
export interface SharedFile {
  file: string;
  owner: string;
  alsoCovered: string[];
  // True when specificity did not decide it and the name tie-break did.
  tied: boolean;
}

// The end of the partition an orphan check cannot see: a file every system
// claims passes "is anything unowned" as easily as a file exactly one claims.
// Reported, never failed — redundant audit coverage is deliberate here, and
// the thing worth knowing is which system a diff will now be charged to.
export function sharedOwnership(manifest: Manifest, files: string[]): SharedFile[] {
  return files.flatMap((file) => {
    const ownership = ownerOf(manifest, file);
    // Owned by nobody: the orphan check's business, and it fails on it.
    if (ownership === null) return [];
    const covering = coveringSystems(manifest, file);
    if (covering.length < 2) return [];
    return [{ file, owner: ownership.system.name, alsoCovered: covering.filter((name) => name !== ownership.system.name), tied: ownership.tiedWith.length > 0 }];
  });
}

export function conceptsClaiming(system: System, file: string): Concept[] {
  return system.concepts.filter((concept) => concept.paths.some((path) => covers(path, file)));
}

export interface ConceptRef {
  system: System;
  concept: Concept;
}

export function allConcepts(manifest: Manifest): ConceptRef[] {
  return manifest.systems.flatMap((system) => system.concepts.map((concept) => ({ system, concept })));
}

export interface OverlappingConcepts {
  system: string;
  path: string;
  concepts: string[];
}

// Two concepts of one system declaring intersecting regions. A file doing
// two jobs is a design signal about the code, not a defect in the manifest,
// so it is reported separately from `checkManifest` and never fails anything.
export function overlappingConcepts(manifest: Manifest): OverlappingConcepts[] {
  const found: OverlappingConcepts[] = [];
  for (const system of manifest.systems) {
    const seen = new Map<string, Set<string>>();
    for (const concept of system.concepts) {
      for (const path of concept.paths) {
        for (const other of system.concepts) {
          if (other === concept) continue;
          if (!other.paths.some((candidate) => pathsOverlap(path, candidate))) continue;
          const key = normalizePath(path);
          if (!seen.has(key)) seen.set(key, new Set());
          seen.get(key)!.add(concept.name);
          seen.get(key)!.add(other.name);
        }
      }
    }
    for (const [path, concepts] of seen) found.push({ system: system.name, path, concepts: [...concepts].sort() });
  }
  return found.sort((a, b) => a.system.localeCompare(b.system) || a.path.localeCompare(b.path));
}

export interface ManifestIssue {
  level: 'error' | 'warning';
  message: string;
}

// Meaning, not shape — everything here is something a reader can answer
// around, so all of it reports and none of it throws. `audit-status` keeps
// its one failing condition and does not gain a second from this list.
export function checkManifest(manifest: Manifest, exists: (path: string) => boolean = existsSync): ManifestIssue[] {
  const issues: ManifestIssue[] = [];

  const seenSystems = new Set<string>();
  for (const system of manifest.systems) {
    if (seenSystems.has(system.name)) issues.push({ level: 'error', message: `duplicate system name: ${system.name}` });
    seenSystems.add(system.name);
  }

  // A path two systems declare identically is the one case the longest-match
  // rule cannot resolve on merit, so it is named here rather than left to a
  // tie-break nobody can see.
  for (const system of manifest.systems) {
    for (const path of system.paths) {
      const rivals = manifest.systems.filter((other) => other !== system && other.paths.some((candidate) => normalizePath(candidate) === normalizePath(path))).map((other) => other.name);
      if (rivals.length > 0 && system.name.localeCompare(rivals[0]) < 0) {
        issues.push({ level: 'warning', message: `${path} is declared identically by ${[system.name, ...rivals].join(' and ')}, so ownership of it is decided by a tie-break rather than by specificity` });
      }
    }
  }

  const conceptOwners = new Map<string, string[]>();
  for (const { system, concept } of allConcepts(manifest)) {
    const key = concept.name.trim().toLowerCase();
    conceptOwners.set(key, [...(conceptOwners.get(key) ?? []), system.name]);

    if (concept.paths.length === 0) issues.push({ level: 'warning', message: `concept "${concept.name}" (${system.name}) names no paths, so nothing resolves to it` });
    if (concept.note === null) issues.push({ level: 'warning', message: `concept "${concept.name}" (${system.name}) has no note saying where its name came from` });

    for (const path of concept.paths) {
      // Ownership, not coverage: `src/content` covers `modportal.ts`, which
      // the Contribution system owns, so a coverage test would let the DSL
      // load path register a concept over another system's module.
      const owner = ownerOf(manifest, path)?.system.name ?? null;
      if (owner !== system.name) {
        issues.push({ level: 'error', message: `concept "${concept.name}" names ${path}, which ${owner === null ? 'no system owns' : `${owner} owns`} — a concept refines its own system and cannot reach outside it` });
      }
      if (!exists(path)) issues.push({ level: 'warning', message: `concept "${concept.name}" (${system.name}) names a path that does not exist: ${path}` });
    }
  }

  for (const [name, owners] of conceptOwners) {
    if (owners.length > 1) issues.push({ level: 'error', message: `concept "${name}" is declared by ${owners.join(' and ')} — a concept belongs to exactly one system, and a name with two owners answers every lookup with the wrong one` });
  }

  return issues;
}
