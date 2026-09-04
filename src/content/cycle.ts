export function firstCycle<N>(nodes: Iterable<N>, edgesOf: (node: N) => Iterable<N>): N[] | null {
  const done = new Set<N>();
  const path: N[] = [];
  const onPath = new Set<N>();
  const walk = (node: N): N[] | null => {
    if (onPath.has(node)) return [...path.slice(path.indexOf(node)), node];
    if (done.has(node)) return null;
    path.push(node);
    onPath.add(node);
    for (const next of edgesOf(node)) {
      const cycle = walk(next);
      if (cycle) return cycle;
    }
    path.pop();
    onPath.delete(node);
    done.add(node);
    return null;
  };
  for (const node of nodes) {
    const cycle = walk(node);
    if (cycle) return cycle;
  }
  return null;
}
