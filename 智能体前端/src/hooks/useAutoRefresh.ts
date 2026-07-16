import { useEffect, useRef } from 'react';

export const SHOPMATE_DATA_UPDATED_EVENT = 'shopmate:data-updated';

export function notifyDataUpdated(detail?: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(SHOPMATE_DATA_UPDATED_EVENT, { detail }),
  );
}

export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  intervalMs: number,
  enabled = true,
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return undefined;

    let disposed = false;
    const run = () => {
      if (disposed || document.visibilityState !== 'visible') return;
      void refreshRef.current();
    };
    const intervalId = window.setInterval(run, intervalMs);
    const onFocus = () => run();
    const onVisibilityChange = () => run();
    const onDataUpdated = () => run();

    window.addEventListener('focus', onFocus);
    window.addEventListener(SHOPMATE_DATA_UPDATED_EVENT, onDataUpdated);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(SHOPMATE_DATA_UPDATED_EVENT, onDataUpdated);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, intervalMs]);
}
