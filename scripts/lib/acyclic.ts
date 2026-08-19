// Pure graph, no reads and no repository knowledge: `layers.ts` owns which
// files are swept and how an import resolves, and hands the result here as
// data. Nothing is imported, which is also what keeps this module out of the
// cycle it exists to find — `architecture.ts` already imports `layers.ts`.

export interface Cycle {
  // Every module on the cycle, path-sorted. A strongly connected component is
  // read as one unit or not at all, so the whole membership is the finding.
  members: string[];
  // The imports that close it: remove these and the component becomes an
  // order. Derived rather than listed, so what a reader is told to invert is
  // the smallest set this ordering could find, not every edge inside.
  closedBy: Array<{ from: string; to: string }>;
}

// Tarjan, iterative. The graph that broke `instances.ts` was 28 modules deep
// and a recursive walk of the whole swept tree is a stack this need not risk.
function components(nodes: readonly string[], out: (node: string) => readonly string[]): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const found: string[][] = [];
  let next = 0;

  for (const root of nodes) {
    if (index.has(root)) continue;
    const work: Array<{ node: string; edge: number }> = [{ node: root, edge: 0 }];
    index.set(root, next);
    low.set(root, next);
    next++;
    stack.push(root);
    onStack.add(root);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const edges = out(frame.node);
      if (frame.edge < edges.length) {
        const target = edges[frame.edge];
        frame.edge++;
        if (!index.has(target)) {
          index.set(target, next);
          low.set(target, next);
          next++;
          stack.push(target);
          onStack.add(target);
          work.push({ node: target, edge: 0 });
        } else if (onStack.has(target)) {
          low.set(frame.node, Math.min(low.get(frame.node) as number, index.get(target) as number));
        }
        continue;
      }
      work.pop();
      const parent = work[work.length - 1];
      if (parent !== undefined) low.set(parent.node, Math.min(low.get(parent.node) as number, low.get(frame.node) as number));
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = [];
        let member: string;
        do {
          member = stack.pop() as string;
          onStack.delete(member);
          component.push(member);
        } while (member !== frame.node);
        found.push(component);
      }
    }
  }
  return found;
}

// Eades, Lin & Smyth: peel sources and sinks, break ties by out-degree minus
// in-degree, and every edge pointing backward in what is left closes a cycle.
// A minimum feedback arc set is NP-hard and a reader does not need the minimum
// — they need a set small enough to act on, and this one is.
function closingEdges(members: readonly string[], out: (node: string) => readonly string[]): Array<{ from: string; to: string }> {
  const inside = new Set(members);
  const live = new Set(members);
  const within = (node: string): string[] => out(node).filter((target) => live.has(target));
  const head: string[] = [];
  const tail: string[] = [];

  const indegree = (node: string): number => [...live].filter((other) => other !== node && within(other).includes(node)).length;

  while (live.size > 0) {
    let peeled = true;
    while (peeled) {
      peeled = false;
      for (const node of [...live]) {
        if (within(node).length === 0) {
          live.delete(node);
          tail.unshift(node);
          peeled = true;
        }
      }
      for (const node of [...live]) {
        if (indegree(node) === 0) {
          live.delete(node);
          head.push(node);
          peeled = true;
        }
      }
    }
    if (live.size === 0) break;
    let pick = '';
    let best = -Infinity;
    for (const node of live) {
      const score = within(node).length - indegree(node);
      if (score > best) {
        best = score;
        pick = node;
      }
    }
    live.delete(pick);
    head.push(pick);
  }

  const order = new Map([...head, ...tail].map((node, at) => [node, at]));
  const backward: Array<{ from: string; to: string }> = [];
  for (const from of members) {
    for (const to of out(from)) {
      if (inside.has(to) && (order.get(to) as number) <= (order.get(from) as number)) backward.push({ from, to });
    }
  }
  return backward.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

// Every group of modules that can only be read together. A component of one is
// a module, not a cycle, so what comes back is empty for a tree that has an
// order — which is the value this rule targets, and it is not a threshold: one
// member per component is the only size at which "read this before that" has
// an answer for every pair.
export function findCycles(nodes: readonly string[], out: (node: string) => readonly string[]): Cycle[] {
  return components(nodes, out)
    .filter((component) => component.length > 1)
    .map((component) => {
      const members = [...component].sort();
      return { members, closedBy: closingEdges(members, out) };
    })
    .sort((a, b) => b.members.length - a.members.length || (a.members[0] ?? '').localeCompare(b.members[0] ?? ''));
}
