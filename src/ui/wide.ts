import { useEffect, useState } from 'react';

export const SIDE_BY_SIDE = '(min-aspect-ratio: 1/1)';

export function useWide(): boolean {
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const asked = typeof window === 'undefined' ? undefined : window.matchMedia?.(SIDE_BY_SIDE);
    if (!asked) return;
    const read = (): void => setWide(asked.matches);
    read();
    asked.addEventListener('change', read);
    return () => asked.removeEventListener('change', read);
  }, []);

  return wide;
}
