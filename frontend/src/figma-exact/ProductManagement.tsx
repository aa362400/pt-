import React, { useState } from 'react';
import {
  Package,
  Search,
  Filter,
  Download,
  Plus,
  Edit,
  Trash2,
  Eye,
  Copy,
  TrendingUp,
  TrendingDown,
  Sparkles,
  RefreshCw,
} from 'lucide-react';

// Platform icon component
const PlatformIcon = ({ platform }: { platform: string }) => {
  const colors = {
    Etsy: 'bg-orange-500',
    Shopify: 'bg-green-500',
    Amazon: 'bg-yellow-600',
    TikTok: 'bg-pink-500',
  };
  
  return (
    <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold ${colors[platform as keyof typeof colors] || 'bg-gray-500'}`}>
      {platform[0]}
    </div>
  );
};

export interface ProductManagementItem {
  id: string;
  name: string;
  sku: string;
  image: string;
  platforms: string[];
  price: string;
  cost: string;
  profit: string;
  stock: number;
  sales30d: number | string;
  views30d: number | string;
  conversionRate: string;
  status: 'active' | 'draft' | 'low_stock' | 'out_of_stock' | 'paused';
  performance: 'excellent' | 'good' | 'poor';
  aiSuggestion: string | null;
}

export interface ProductManagementStat {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: typeof Package;
}

interface ProductManagementProps {
  products: ProductManagementItem[];
  stats: ProductManagementStat[];
  loading?: boolean;
  syncing?: boolean;
  onExport?: () => void;
  onAdd?: () => void;
  onSync?: () => void;
  onView?: (productId: string) => void;
  onEdit?: (productId: string) => void;
  onCopy?: (productId: string) => void;
  onDelete?: (productId: string) => void;
  onBatchEdit?: (productIds: string[]) => void;
  onBatchDelete?: (productIds: string[]) => void;
}

export function ProductManagement({ products, stats, loading = false, syncing = false, onExport, onAdd, onSync, onView, onEdit, onCopy, onDelete, onBatchEdit, onBatchDelete }: ProductManagementProps) {
  const [selectedTab, setSelectedTab] = useState('all');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const statusConfig = {
    active: { label: 'Active', color: 'bg-green-50 text-green-700 border-green-200' },
    draft: { label: 'Draft', color: 'bg-gray-50 text-gray-700 border-gray-200' },
    low_stock: { label: 'Low stock', color: 'bg-orange-50 text-orange-700 border-orange-200' },
    out_of_stock: { label: 'Out of stock', color: 'bg-red-50 text-red-700 border-red-200' },
    paused: { label: 'Paused', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  };

  const performanceConfig = {
    excellent: { label: 'Excellent', color: 'text-green-600', icon: '🔥' },
    good: { label: 'Good', color: 'text-blue-600', icon: '👍' },
    poor: { label: 'Needs optimization', color: 'text-orange-600', icon: '⚠️' },
  };

  const toggleProduct = (id: string) => {
    if (selectedProducts.includes(id)) {
      setSelectedProducts(selectedProducts.filter(productId => productId !== id));
    } else {
      setSelectedProducts([...selectedProducts, id]);
    }
  };

  const toggleAll = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map(product => product.id));
    }
  };

  const visibleProducts = products.filter((product) => {
    if (selectedTab !== 'all' && product.status !== selectedTab) return false;
    const query = searchQuery.trim().toLocaleLowerCase();
    return !query || `${product.name} ${product.sku}`.toLocaleLowerCase().includes(query);
  });

  return (
    <div className="p-0">
      {/* Page title */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Management</h1>
          <p className="text-gray-500 mt-1">Manage cross-platform product inventory, pricing, sales data and AI optimization suggestions</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={onExport} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4 text-gray-600" />
            Export
          </button>
          <button onClick={onAdd} className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium">
            <Plus className="w-5 h-5" />
            Add product
          </button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 xl:gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center`}>
                <stat.icon className={`w-5 h-5 ${stat.trend === 'up' ? 'text-blue-600' : 'text-gray-600'}`} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${
                stat.trend === 'up' ? 'text-green-600' : 'text-gray-600'
              }`}>
                {stat.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* AI english_text */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-8 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-2">AI Product Optimization Suggestions</h3>
            <div className="space-y-2">
              {products.filter((product) => product.aiSuggestion).slice(0, 3).map((product) => (
                <div key={product.id} className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{product.name}：{product.aiSuggestion}</span>
                </div>
              ))}
              {!loading && !products.some((product) => product.aiSuggestion) && (
                <div className="text-sm text-gray-600">The backend has not returned real agent product suggestions, so design samples are hidden.</div>
              )}
            </div>
          </div>
          <button onClick={() => onBatchEdit?.(products.filter((product) => product.aiSuggestion).map((product) => product.id))} className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium border border-gray-200">
            textNeeds optimizationproduct
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* Toolbar */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search product name or SKU..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <button type="button" className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-500" title="english_textstatusenglish_textsearchtextFilter">
                <Filter className="w-4 h-4 text-gray-500" />
                Filter
              </button>

              <button onClick={onSync} disabled={syncing} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm disabled:opacity-50">
                <RefreshCw className="w-4 h-4 text-gray-500" />
                {syncing ? 'Syncing' : 'Sync'}
              </button>
            </div>

            <div className="flex items-center gap-3">
              {selectedProducts.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Selected {selectedProducts.length} items</span>
                  <button onClick={() => onBatchEdit?.(selectedProducts)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    Batch edit
                  </button>
                  <button onClick={() => onBatchDelete?.(selectedProducts)} className="px-3 py-1.5 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 text-sm">
                    Batch delete
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* english_text */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 -mb-6">
            {[
              { key: 'all', label: 'Allproduct', count: products.length },
              { key: 'active', label: 'Activetext', count: products.filter((product) => product.status === 'active').length },
              { key: 'draft', label: 'Draft', count: products.filter((product) => product.status === 'draft').length },
              { key: 'low_stock', label: 'Low stock', count: products.filter((product) => product.status === 'low_stock').length },
              { key: 'out_of_stock', label: 'Out of stock', count: products.filter((product) => product.status === 'out_of_stock').length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSelectedTab(tab.key)}
                className={`px-4 py-2 text-sm font-medium transition-colors relative ${
                  selectedTab === tab.key
                    ? 'text-blue-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
                <span className="ml-2 text-xs text-gray-400">({tab.count})</span>
                {selectedTab === tab.key && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* producttext */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedProducts.length === products.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">producttext</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">platform</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">text/profit</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">text</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">30english_text</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Conversion rate</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">status</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI text</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">text</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-500">textreadrealProductstext...</td></tr>}
              {!loading && products.length === 0 && <tr><td colSpan={10} className="px-6 py-10 text-center text-sm text-gray-500">english_textyesrealproducttext，english_text Figma exampleproduct。</td></tr>}
              {visibleProducts.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 overflow-hidden bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                        {/^https?:\/\//i.test(product.image) ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" loading="lazy" /> : product.image}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{product.name}</div>
                        <div className="text-xs text-gray-500">SKU: {product.sku}</div>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`text-xs ${performanceConfig[product.performance as keyof typeof performanceConfig].color}`}>
                            {performanceConfig[product.performance as keyof typeof performanceConfig].icon}
                            {performanceConfig[product.performance as keyof typeof performanceConfig].label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      {product.platforms.map((platform, index) => (
                        <PlatformIcon key={index} platform={platform} />
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{product.price}</div>
                    <div className="text-xs text-green-600">profit: {product.profit}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`font-medium ${
                      product.stock === 0 ? 'text-red-600' :
                      product.stock < 50 ? 'text-orange-600' :
                      'text-gray-900'
                    }`}>
                      {product.stock}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{product.sales30d}</div>
                    <div className="text-xs text-gray-500">{product.views30d} text</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{product.conversionRate}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                      statusConfig[product.status as keyof typeof statusConfig].color
                    }`}>
                      {statusConfig[product.status as keyof typeof statusConfig].label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {product.aiSuggestion ? (
                      <div className="flex items-start gap-2 max-w-xs">
                        <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-gray-600 line-clamp-2">{product.aiSuggestion}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onView?.(product.id)} aria-label={`text ${product.name}`} className="p-1.5 hover:bg-gray-100 rounded text-gray-600">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => onEdit?.(product.id)} aria-label={`text ${product.name}`} className="p-1.5 hover:bg-gray-100 rounded text-gray-600">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => onCopy?.(product.id)} aria-label={`text ${product.name}`} className="p-1.5 hover:bg-gray-100 rounded text-gray-600">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={() => onDelete?.(product.id)} aria-label={`text ${product.name}`} className="p-1.5 hover:bg-red-50 rounded text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* text */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            text {visibleProducts.length === 0 ? 0 : 1}-{visibleProducts.length} text，text {products.length} textrealproduct
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
              english_text
            </button>
            <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">1</button>
            <button className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
              english_text
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
