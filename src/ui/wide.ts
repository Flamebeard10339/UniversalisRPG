import { useEffect, useState } from 'react';

export const SIDE_BY_SIDE = '(min-aspect-ratio: 1/1)';

// A question put to the browser and kept up to date, for the things a stylesheet cannot answer on
// its own. Asked once here so that a caller names the query and nothing else.
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const asked = typeof window === 'undefined' ? undefined : window.matchMedia?.(query);
    if (!asked) return;
    const read = (): void => setMatches(asked.matches);
    read();
    asked.addEventListener('change', read);
    return () => asked.removeEventListener('change', read);
  }, [query]);

  return matches;
}

export const useWide = (): boolean => useMedia(SIDE_BY_SIDE);
