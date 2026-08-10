import { CheckCircle2, Clock3, ExternalLink, ShieldAlert } from 'lucide-react';
import type { ChannelConnection } from '../../api/channels';
import {
  MARKETPLACE_PROVIDERS,
  channelsForProvider,
  marketplaceConfig,
  type MarketplaceProvider,
} from '../../lib/marketplaces';

interface MarketplaceSwitcherProps {
  activeProvider: MarketplaceProvider;
  onChange: (provider: MarketplaceProvider) => void;
  channels?: ChannelConnection[];
  productCounts?: Partial<Record<MarketplaceProvider, number>>;
  orderCounts?: Partial<Record<MarketplaceProvider, number>>;
  className?: string;
}

function statusClass(isReady: boolean): string {
  return isReady
    ? 'bg-[#EEFDF6] text-[#0F8A55]'
    : 'bg-[#FFF8E8] text-[#8A5B00]';
}

export default function MarketplaceSwitcher({
  activeProvider,
  onChange,
  channels = [],
  productCounts = {},
  orderCounts = {},
  className = '',
}: MarketplaceSwitcherProps) {
  return (
    <div className={`rounded-xl border border-[#E8E8F0] bg-white p-3 shadow-sm ${className}`}>
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#1A1A2E]">多平台数据上下文</h3>
          <p className="mt-1 text-xs leading-5 text-[#6B7280]">
            切换平台后，页面只展示该平台的连接、商品、订单和同步状态；未接入的平台保持空状态。
          </p>
        </div>
        <a
          href={marketplaceConfig[activeProvider].docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 w-fit items-center gap-1.5 rounded-lg border border-[#DDE1F2] px-2.5 text-xs font-medium text-[#4A5578] hover:bg-[#F8F9FF]"
        >
          <ExternalLink size={13} />
          官方接口文档
        </a>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {MARKETPLACE_PROVIDERS.map((provider) => {
          const config = marketplaceConfig[provider];
          const providerChannels = channelsForProvider(channels, provider);
          const connectedCount = providerChannels.filter(
            (channel) => channel.syncStatus !== 'DISCONNECTED',
          ).length;
          const isActive = activeProvider === provider;
          const isReady = config.backendStatus === 'verified';
          const StatusIcon = isReady ? CheckCircle2 : ShieldAlert;

          return (
            <button
              key={provider}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(provider)}
              className={`rounded-lg border p-3 text-left transition-colors ${
                isActive
                  ? 'border-[#6C63FF] bg-[#F7F6FF]'
                  : 'border-[#EEF0FA] bg-white hover:border-[#C9D1FF] hover:bg-[#FAFBFF]'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                    style={{
                      backgroundColor: `${config.color}14`,
                      color: config.color,
                    }}
                  >
                    {config.shortLabel.slice(0, 1)}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-[#1A1A2E]">
                        {config.label}
                      </p>
                      <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${statusClass(isReady)}`}>
                        <StatusIcon size={12} />
                        {config.backendStatusLabel}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-[#6B7280]">
                      {config.connectionMode}
                    </p>
                  </div>
                </div>
                {isActive ? (
                  <CheckCircle2 size={16} className="shrink-0 text-[#6C63FF]" />
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-lg bg-white/70 p-2">
                  <p className="text-[#8B93B5]">渠道</p>
                  <p className="mt-1 font-semibold text-[#1A1A2E]">
                    {connectedCount}/{providerChannels.length}
                  </p>
                </div>
                <div className="rounded-lg bg-white/70 p-2">
                  <p className="text-[#8B93B5]">商品</p>
                  <p className="mt-1 font-semibold text-[#1A1A2E]">
                    {productCounts[provider] ?? '-'}
                  </p>
                </div>
                <div className="rounded-lg bg-white/70 p-2">
                  <p className="text-[#8B93B5]">订单</p>
                  <p className="mt-1 font-semibold text-[#1A1A2E]">
                    {orderCounts[provider] ?? '-'}
                  </p>
                </div>
              </div>

              {!isReady ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-[#FFF8E8] p-2 text-xs leading-5 text-[#8A5B00]">
                  <Clock3 size={13} className="mt-0.5 shrink-0" />
                  <span>需要后端增加 TEMU provider、密钥加密存储、签名客户端和真实同步任务后才能连接。</span>
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
