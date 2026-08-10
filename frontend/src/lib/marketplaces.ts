import type { ChannelConnection, ChannelProvider } from '../api/channels';

export type MarketplaceProvider = Extract<ChannelProvider, 'OZON' | 'TEMU'>;

export interface MarketplaceConfig {
  id: MarketplaceProvider;
  label: string;
  shortLabel: string;
  color: string;
  docsUrl: string;
  connectionMode: string;
  backendStatus: 'verified' | 'designing';
  backendStatusLabel: string;
  emptyState: string;
  requirements: string[];
}

export const MARKETPLACE_PROVIDERS: MarketplaceProvider[] = ['OZON', 'TEMU'];

export const marketplaceConfig: Record<MarketplaceProvider, MarketplaceConfig> = {
  OZON: {
    id: 'OZON',
    label: 'Ozon',
    shortLabel: 'Ozon',
    color: '#005BFF',
    docsUrl: 'https://docs.ozon.ru/api/seller/',
    connectionMode: 'Client-Id / Api-Key',
    backendStatus: 'verified',
    backendStatusLabel: 'Real sync connected',
    emptyState: '暂无真实 Ozon 数据。请先绑定 Ozon Seller API，再同步Product或订单。',
    requirements: ['Seller API Client-Id', 'Seller API Api-Key', 'Backend credential verification'],
  },
  TEMU: {
    id: 'TEMU',
    label: 'TEMU',
    shortLabel: 'TEMU',
    color: '#F05A22',
    docsUrl: 'https://partner.temu.com/documentation?menu_code=fb16b05f7a904765aac4af3a24b87d4a',
    connectionMode: 'App Key / Access Token / MD5 signature',
    backendStatus: 'designing',
    backendStatusLabel: 'Backend authorization integration pending',
    emptyState: 'No real TEMU data yet. This view only shows the integration design and does not generate sample data.',
    requirements: [
      'Obtain access_token after Seller Center authorization',
      'Call openapi/router with type set to the API name',
      'Use app_secret in the MD5 signature; the backend stores the secret',
    ],
  },
};

export function isMarketplaceProvider(
  value: string | null | undefined,
): value is MarketplaceProvider {
  return value === 'OZON' || value === 'TEMU';
}

export function marketplaceSource(provider: MarketplaceProvider): string {
  return provider.toLowerCase();
}

export function canUseMarketplaceBackend(provider: MarketplaceProvider): boolean {
  return marketplaceConfig[provider].backendStatus === 'verified';
}

export function activeChannelForProvider(
  channels: ChannelConnection[],
  provider: MarketplaceProvider,
): ChannelConnection | null {
  return (
    channels.find(
      (channel) =>
        channel.provider === provider && channel.syncStatus !== 'DISCONNECTED',
    ) ?? null
  );
}

export function channelsForProvider(
  channels: ChannelConnection[],
  provider: MarketplaceProvider,
): ChannelConnection[] {
  return channels.filter((channel) => channel.provider === provider);
}
