import React from 'react';
import {
  Plus,
  Wifi,
  WifiOff,
  RefreshCw,
  Settings,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Key,
  Sparkles,
} from 'lucide-react';

export interface PlatformConnectionItem {
  id: string;
  name: string;
  logo: string;
  color: string;
  status: 'connected' | 'disconnected' | 'error';
  stores: Array<{
    name: string;
    storeId: string;
    connected: boolean;
    products: number | null;
    orders: number | null;
    countScope?: string;
    lastSync: string;
    apiStatus: 'healthy' | 'warning' | 'error';
    warning?: string;
  }>;
  features: string[];
  apiVersion: string;
  quota: { used: number; total: number } | null;
}
export interface PlatformConnectionStat { label: string; value: string; icon: typeof Wifi; color: string }
interface PlatformConnectionProps {
  platforms: PlatformConnectionItem[];
  stats: PlatformConnectionStat[];
  loading?: boolean;
  syncingStoreId?: string | null;
  onConnectPlatform?: () => void;
  onSyncStore?: (platformId: string, storeId: string) => void;
  onDiagnoseStore?: (platformId: string, storeId: string) => void;
  onOpenDocs?: (platformId: string) => void;
}

export function PlatformConnection({
  platforms,
  stats,
  loading = false,
  syncingStoreId = null,
  onConnectPlatform,
  onSyncStore,
  onDiagnoseStore,
  onOpenDocs,
}: PlatformConnectionProps) {
  const statusConfig = {
    connected: { label: 'Connected', color: 'bg-green-50 text-green-700 border-green-200', icon: Wifi },
    disconnected: { label: 'Disconnected', color: 'bg-gray-50 text-gray-700 border-gray-200', icon: WifiOff },
    error: { label: 'connectionIssue', color: 'bg-red-50 text-red-700 border-red-200', icon: AlertCircle },
  };

  const apiStatusConfig = {
    healthy: { label: 'Healthy', color: 'text-green-600', icon: CheckCircle2 },
    warning: { label: 'Warning', color: 'text-orange-600', icon: AlertCircle },
    error: { label: 'Error', color: 'text-red-600', icon: AlertCircle },
  };

  return (
    <div className="p-0">
      {/* Page title */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Connections</h1>
          <p className="text-gray-500 mt-1">connectionenglish_textyese-commerceplatform，textdatatextSync</p>
        </div>
        <button onClick={onConnectPlatform} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium">
          <Plus className="w-5 h-5" />
          Connect new platform
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
              <div className={`w-12 h-12 rounded-lg bg-gray-50 flex items-center justify-center ${stat.color}`}>
                <stat.icon className="w-6 h-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Syncenglish_text */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-8 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-2">Syncstatusenglish_text</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700">{platforms.filter((platform) => platform.status === 'connected').length} platforms are verified by real connection records.</span>
              </div>
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700">SyncfailedtextWarningenglish_text，english_textconnectionsuccess。</span>
              </div>
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-700">english_textDone Ozon；TEMU textpassedrealbackendacceptanceenglish_textstatus。</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Platform list */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {loading && <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">textreadrealPlatform Connections...</div>}
        {platforms.map((platform) => (
          <div key={platform.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Platform header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-14 h-14 ${platform.color} rounded-xl flex items-center justify-center text-white text-2xl font-bold`}>
                    {platform.logo}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{platform.name}</h3>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${
                        statusConfig[platform.status as keyof typeof statusConfig].color
                      }`}>
                        {React.createElement(statusConfig[platform.status as keyof typeof statusConfig].icon, { className: "w-3 h-3" })}
                        {statusConfig[platform.status as keyof typeof statusConfig].label}
                      </span>
                      <span className="text-xs text-gray-500">API {platform.apiVersion}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {platform.status === 'connected' ? (
                    <>
                      {platform.stores[0] ? (
                        <button
                          type="button"
                          title="Syncplatformdata"
                          aria-label={`Sync ${platform.name} data`}
                          disabled={syncingStoreId === platform.stores[0].storeId}
                          onClick={() => onSyncStore?.(platform.id, platform.stores[0].storeId)}
                          className="p-2 hover:bg-gray-100 rounded-lg disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 text-gray-600 ${syncingStoreId === platform.stores[0].storeId ? 'animate-spin' : ''}`} />
                        </button>
                      ) : null}
                      {platform.stores[0] ? (
                        <button
                          type="button"
                          title="Connection diagnostics"
                          aria-label={`text ${platform.name} connection`}
                          onClick={() => onDiagnoseStore?.(platform.id, platform.stores[0].storeId)}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                        >
                          <Settings className="w-4 h-4 text-gray-600" />
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <button onClick={onConnectPlatform} className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow text-sm font-medium">
                      Connect now
                    </button>
                  )}
                </div>
              </div>

              {/* Features */}
              <div className="flex flex-wrap gap-2">
                {platform.features.map((feature, index) => (
                  <span key={index} className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">
                    {feature}
                  </span>
                ))}
              </div>
            </div>

            {/* Store list */}
            {platform.stores.length > 0 && (
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium text-gray-900">Connectedstore</h4>
                  <button onClick={onConnectPlatform} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    + Add store
                  </button>
                </div>

                <div className="space-y-3">
                  {platform.stores.map((store, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h5 className="font-medium text-gray-900">{store.name}</h5>
                          <p className="text-xs text-gray-500 mt-1">Store ID: {store.storeId}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {store.apiStatus && (
                            <div className={`flex items-center gap-1 ${apiStatusConfig[store.apiStatus as keyof typeof apiStatusConfig].color}`}>
                              {React.createElement(apiStatusConfig[store.apiStatus as keyof typeof apiStatusConfig].icon, { className: "w-3 h-3" })}
                              <span className="text-xs font-medium">
                                {apiStatusConfig[store.apiStatus as keyof typeof apiStatusConfig].label}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                    {'warning' in store && store.warning && (
                        <div className="mb-3 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                          ⚠️ {store.warning}
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4 mb-3">
                        <div>
                          <div className="text-xs text-gray-500">Products</div>
                          <div className="text-sm font-medium text-gray-900">{store.products ?? 'textread'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">textorders</div>
                          <div className="text-sm font-medium text-gray-900">{store.orders ?? 'textread'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">textSync</div>
                          <div className="text-sm font-medium text-gray-900">{store.lastSync}</div>
                        </div>
                      </div>

                      {store.countScope ? <p className="mb-3 text-[11px] text-gray-500">{store.countScope}</p> : null}

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={!store.connected || syncingStoreId === store.storeId}
                          onClick={() => onSyncStore?.(platform.id, store.storeId)}
                          className="flex flex-1 items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 ${syncingStoreId === store.storeId ? 'animate-spin' : ''}`} />
                          {syncingStoreId === store.storeId ? 'Syncing' : 'Syncdata'}
                        </button>
                        <button
                          type="button"
                          title="Connection diagnostics"
                          aria-label={`textstore ${store.name}`}
                          onClick={() => onDiagnoseStore?.(platform.id, store.storeId)}
                          className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-xs"
                        >
                          <Settings className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          title="textplatformAPItext"
                          aria-label={`text ${platform.name} APItext`}
                          onClick={() => onOpenDocs?.(platform.id)}
                          className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-xs"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* API text */}
            {platform.quota && (
              <div className="px-6 pb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">API english_text</span>
                    <span className="text-xs text-gray-500">
                      {platform.quota.used.toLocaleString()} / {platform.quota.total.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        platform.quota.used / platform.quota.total > 0.8
                          ? 'bg-red-500'
                          : platform.quota.used / platform.quota.total > 0.6
                          ? 'bg-orange-500'
                          : 'bg-green-500'
                      }`}
                      style={{ width: `${(platform.quota.used / platform.quota.total) * 100}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* connectiontext */}
      <div className="mt-8 bg-white rounded-xl p-8 shadow-sm border border-gray-100">
        <div className="text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Key className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">textConnect new platform？</h3>
          <p className="text-gray-600 mb-6">
            english_textplatformtext API keysenglish_text，english_textDonesecurityenglish_textflow。
            textyesdataenglish_text SSL text，english_textstoretextsecurity。
          </p>
          <div className="flex items-center justify-center gap-4">
            <button onClick={() => onOpenDocs?.('OZON')} className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium">
              textconnectiontext
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
