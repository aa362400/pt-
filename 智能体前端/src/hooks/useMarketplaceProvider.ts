import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  isMarketplaceProvider,
  marketplaceConfig,
  type MarketplaceProvider,
} from '../lib/marketplaces';

export function useMarketplaceProvider(defaultProvider: MarketplaceProvider = 'OZON') {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawProvider = searchParams.get('provider');
  const activeProvider = isMarketplaceProvider(rawProvider)
    ? rawProvider
    : defaultProvider;

  const setActiveProvider = useCallback(
    (provider: MarketplaceProvider) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set('provider', provider);
        next.delete('page');
        return next;
      });
    },
    [setSearchParams],
  );

  const activeMarketplace = useMemo(
    () => marketplaceConfig[activeProvider],
    [activeProvider],
  );

  return { activeProvider, activeMarketplace, setActiveProvider };
}
