import { useEffect, useState } from 'react';

const isPageVisible = () => typeof document === 'undefined' || !document.hidden;

export const useNow = (active: boolean, intervalMs = 50) => {
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(isPageVisible);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const updateVisibility = () => {
      setVisible(isPageVisible());
      setNow(Date.now());
    };

    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!active || !visible) {
      setNow(Date.now());
      return undefined;
    }

    const interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(interval);
  }, [active, intervalMs, visible]);

  return active && visible ? now : Date.now();
};
