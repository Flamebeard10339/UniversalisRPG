import type { JsonPatchOperation } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const encodePathPart = (value: string) => value.replace(/~/g, '~0').replace(/\//g, '~1');
const decodePathPart = (value: string) => value.replace(/~1/g, '/').replace(/~0/g, '~');

const isEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const childPath = (basePath: string, key: string) => `${basePath}/${encodePathPart(key)}`;

const hasId = (value: unknown): value is { id: string } =>
  isRecord(value) && typeof value.id === 'string';

const diffStringArrayPatch = (previous: string[], next: string[], basePath: string): JsonPatchOperation[] => {
  const lengths = Array.from({ length: previous.length + 1 }, () => Array(next.length + 1).fill(0) as number[]);
  for (let previousIndex = previous.length - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let nextIndex = next.length - 1; nextIndex >= 0; nextIndex -= 1) {
      lengths[previousIndex][nextIndex] = previous[previousIndex] === next[nextIndex]
        ? lengths[previousIndex + 1][nextIndex + 1] + 1
        : Math.max(lengths[previousIndex + 1][nextIndex], lengths[previousIndex][nextIndex + 1]);
    }
  }

  const matchedPrevious = new Set<number>();
  const matchedNext = new Set<number>();
  let previousIndex = 0;
  let nextIndex = 0;
  while (previousIndex < previous.length && nextIndex < next.length) {
    if (previous[previousIndex] === next[nextIndex]) {
      matchedPrevious.add(previousIndex);
      matchedNext.add(nextIndex);
      previousIndex += 1;
      nextIndex += 1;
    } else if (lengths[previousIndex + 1][nextIndex] >= lengths[previousIndex][nextIndex + 1]) {
      previousIndex += 1;
    } else {
      nextIndex += 1;
    }
  }

  const removals = previous
    .map((_, index) => index)
    .filter((index) => !matchedPrevious.has(index))
    .sort((left, right) => right - left);
  const additions = next
    .map((item, index) => ({ item, index }))
    .filter((entry) => !matchedNext.has(entry.index));
  const ops: JsonPatchOperation[] = removals.map((index) => ({ op: 'remove', path: childPath(basePath, String(index)) }));
  let currentLength = previous.length - removals.length;
  for (const { item, index } of additions) {
    const path = index >= currentLength ? childPath(basePath, '-') : childPath(basePath, String(index));
    ops.push({ op: 'add', path, value: item });
    currentLength += 1;
  }
  return ops;
};

const diffArrayPatch = (previous: unknown[], next: unknown[], basePath: string): JsonPatchOperation[] | null => {
  const primitiveIds = previous.every((item) => typeof item === 'string') && next.every((item) => typeof item === 'string');
  const objectIds = previous.every(hasId) && next.every(hasId);
  if (!primitiveIds && !objectIds) return null;
  if (primitiveIds) return diffStringArrayPatch(previous as string[], next as string[], basePath);

  const keyFor = (item: unknown) => (typeof item === 'string' ? item : hasId(item) ? item.id : '');
  const previousByKey = new Map(previous.map((item, index) => [keyFor(item), { item, index }]));
  const nextByKey = new Map(next.map((item, index) => [keyFor(item), { item, index }]));
  const ops: JsonPatchOperation[] = [];

  for (const [key, { index }] of [...previousByKey.entries()].sort((left, right) => right[1].index - left[1].index)) {
    if (!nextByKey.has(key)) ops.push({ op: 'remove', path: childPath(basePath, String(index)) });
  }

  for (const [key, { item, index }] of nextByKey.entries()) {
    const previousEntry = previousByKey.get(key);
    if (!previousEntry) {
      ops.push({ op: 'add', path: childPath(basePath, '-'), value: item });
    } else if (objectIds) {
      ops.push(...diffJsonPatch(previousEntry.item, item, childPath(basePath, String(index))));
    } else if (previousEntry.index !== index) {
      return [{ op: 'replace', path: basePath, value: next }];
    }
  }

  return ops;
};

export const diffJsonPatch = (previous: unknown, next: unknown, basePath = ''): JsonPatchOperation[] => {
  if (isEqual(previous, next)) return [];
  if (Array.isArray(previous) && Array.isArray(next)) {
    return diffArrayPatch(previous, next, basePath) ?? [{ op: 'replace', path: basePath, value: next }];
  }
  if (!isRecord(previous) || !isRecord(next)) {
    return [{ op: previous === undefined ? 'add' : 'replace', path: basePath, value: next }];
  }

  const ops: JsonPatchOperation[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const key of keys) {
    if (!(key in next)) {
      ops.push({ op: 'remove', path: childPath(basePath, key) });
    } else if (!(key in previous)) {
      ops.push({ op: 'add', path: childPath(basePath, key), value: next[key] });
    } else {
      ops.push(...diffJsonPatch(previous[key], next[key], childPath(basePath, key)));
    }
  }
  return ops;
};

export const applyJsonPatch = <T>(value: T, ops: JsonPatchOperation[]): T => {
  let next = structuredClone(value) as unknown;

  const targetFor = (path: string) => {
    if (path === '') return { parent: null as Record<string, unknown> | unknown[] | null, key: '' };
    const parts = path.split('/').slice(1).map(decodePathPart);
    const key = parts.pop() ?? '';
    let parent: Record<string, unknown> | unknown[] | undefined = next as Record<string, unknown> | unknown[];
    for (const part of parts) {
      if (parent === undefined) break;
      parent = (Array.isArray(parent) ? parent[Number(part)] : parent[part]) as Record<string, unknown> | unknown[] | undefined;
    }
    return { parent, key };
  };

  for (const op of ops) {
    const { parent, key } = targetFor(op.path);
    // A patch targeting a nested path inside an object that does not exist
    // in this bundle (e.g. a module patching a location owned by a
    // dependency that is not currently enabled) has nothing to apply to.
    if (parent === undefined) continue;
    if (parent === null) {
      if (op.op === 'remove') next = undefined;
      else next = structuredClone(op.value);
      continue;
    }

    if (Array.isArray(parent)) {
      const index = key === '-' ? parent.length : Number(key);
      if (op.op === 'remove') parent.splice(index, 1);
      else if (op.op === 'add') parent.splice(index, 0, structuredClone(op.value));
      else parent[index] = structuredClone(op.value);
    } else if (op.op === 'remove') {
      delete parent[key];
    } else {
      parent[key] = structuredClone(op.value);
    }
  }

  return next as T;
};
