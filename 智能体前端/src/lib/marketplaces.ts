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
    backendStatusLabel: '真实同步已接入',
    emptyState: '暂无真实 Ozon 数据。请先绑定 Ozon Seller API，再同步商品或订单。',
    requirements: ['Seller API Client-Id', 'Seller API Api-Key', '后端真实校验凭据'],
  },
  TEMU: {
    id: 'TEMU',
    label: 'TEMU',
    shortLabel: 'TEMU',
    color: '#F05A22',
    docsUrl: 'https://partner.temu.com/documentation?menu_code=fb16b05f7a904765aac4af3a24b87d4a',
    connectionMode: 'App Key / Access Token / MD5 签名',
    backendStatus: 'designing',
    backendStatusLabel: '后端授权接入待实现',
    emptyState: '暂无真实 TEMU 数据。当前只展示接入设计，不生成示例数据。',
    requirements: [
      'Seller Center 授权后获得 access_token',
      '请求 openapi/router，type 指定接口名',
      'app_secret 参与 MD5 签名，后端保存密钥',
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
