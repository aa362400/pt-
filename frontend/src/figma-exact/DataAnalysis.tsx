import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingBag,
  Package,
  Users,
  Globe,
  Sparkles,
} from 'lucide-react';
import { LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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

export function DataAnalysis() {
  const [dateRange, setDateRange] = useState('7天');

  // 销售数据
  const salesData = [
    { date: '07/06', 销售额: 2850, 订单: 68, 利润: 1140 },
    { date: '07/07', 销售额: 2980, 订单: 72, 利润: 1192 },
    { date: '07/08', 销售额: 2900, 订单: 65, 利润: 1160 },
    { date: '07/09', 销售额: 3300, 订单: 82, 利润: 1320 },
    { date: '07/10', 销售额: 3540, 订单: 88, 利润: 1416 },
    { date: '07/11', 销售额: 3350, 订单: 79, 利润: 1340 },
    { date: '07/12', 销售额: 3842, 订单: 95, 利润: 1537 },
  ];

  // 平台分布数据
  const platformData = [
    { name: 'Etsy', value: 42, color: '#F97316' },
    { name: 'Amazon', value: 28, color: '#3B82F6' },
    { name: 'Shopify', value: 18, color: '#10B981' },
    { name: 'TikTok', value: 12, color: '#EC4899' },
  ];

  // 地区分布
  const regionData = [
    { region: '美国', sales: 12450, orders: 340, growth: '+15.2%' },
    { region: '英国', sales: 5680, orders: 156, growth: '+8.5%' },
    { region: '加拿大', sales: 4320, orders: 118, growth: '+12.8%' },
    { region: '澳大利亚', sales: 3890, orders: 102, growth: '+6.3%' },
    { region: '德国', sales: 2560, orders: 72, growth: '+4.1%' },
  ];

  // 热销商品
  const topProducts = [
    { name: '手工陶瓷杯套装', sales: '$2,450', orders: 86, platform: 'Etsy', growth: '+28%' },
    { name: '复古风格海报', sales: '$1,890', orders: 124, platform: 'Shopify', growth: '+15%' },
    { name: '定制婚礼请柬', sales: '$1,650', orders: 45, platform: 'Etsy', growth: '+32%' },
    { name: '现代简约台灯', sales: '$1,420', orders: 38, platform: 'Amazon', growth: '+12%' },
    { name: '个性化手机壳', sales: '$980', orders: 156, platform: 'TikTok', growth: '+45%' },
  ];

  const stats = [
    { label: '总销售额', value: '$26,842', change: '+18.5%', trend: 'up', icon: DollarSign },
    { label: '总订单数', value: '856', change: '+12.3%', trend: 'up', icon: ShoppingBag },
    { label: '平均客单价', value: '$31.36', change: '+5.2%', trend: 'up', icon: Users },
    { label: 'Active商品', value: '1,248', change: '+24', trend: 'up', icon: Package },
  ];

  return (
    <div className="p-8">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Data Analysis</h1>
        <p className="text-gray-500 mt-1">多维度Data Analysis，AI 智能洞察，助力科学决策</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center`}>
                <stat.icon className="w-6 h-6 text-blue-600" />
              </div>
              <div className={`flex items-center gap-1 text-sm font-medium ${
                stat.trend === 'up' ? 'text-green-600' : 'text-red-600'
              }`}>
                {stat.trend === 'up' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                {stat.change}
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900 mb-1">{stat.value}</div>
            <div className="text-sm text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* AI 智能洞察 */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-8 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-3">AI 经营洞察</h3>
            <div className="space-y-3">
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">📈 增长机会</h4>
                    <p className="text-sm text-gray-700">
                      过去 7 天，Etsy 美国市场的<strong>婚礼类商品</strong>流量增长 <strong className="text-green-600">23%</strong>，
                      但移动端Conversion rate下降 1.2%。建议优化首图展示和价格标签，预计可提升Conversion rate至 5.5%。
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <TrendingDown className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">⚠️ 需要关注</h4>
                    <p className="text-sm text-gray-700">
                      TikTok Shop 的<strong>个性化手机壳</strong>虽然订单量高，但利润率仅 <strong className="text-orange-600">12%</strong>，
                      低于平台平均水平。建议调整定价策略或优化成本结构。
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">💡 优化建议</h4>
                    <p className="text-sm text-gray-700">
                      检测到 <strong>8 个商品</strong>有流量但无转化。AI 建议优化标题关键词、调整价格区间，
                      预计可新增 <strong className="text-blue-600">$150-200/日</strong> 销售额。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <button className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium border border-gray-200">
            生成报告
          </button>
        </div>
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* 销售趋势 */}
        <div className="col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">销售与利润趋势</h2>
              <p className="text-sm text-gray-500 mt-1">多指标对比分析</p>
            </div>
            <div className="flex items-center gap-2">
              {['7天', '30天', '90天'].map((period) => (
                <button
                  key={period}
                  onClick={() => setDateRange(period)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    dateRange === period
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
              <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="销售额" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="利润" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* 平台分布 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">平台销售占比</h2>
            <p className="text-sm text-gray-500 mt-1">各平台贡献分析</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={platformData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {platformData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 space-y-2">
            {platformData.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-sm text-gray-700">{item.name}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 地区分布和热销商品 */}
      <div className="grid grid-cols-2 gap-6">
        {/* 地区销售排行 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">地区销售排行</h2>
              <p className="text-sm text-gray-500 mt-1">按销售额排序</p>
            </div>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              查看All
            </button>
          </div>
          <div className="space-y-4">
            {regionData.map((region, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                  index === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' :
                  index === 1 ? 'bg-gray-200 text-gray-700' :
                  index === 2 ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {index + 1}
                </div>
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-900">{region.region}</span>
                </div>
                <div className="flex-1"></div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">${region.sales.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{region.orders} 订单</div>
                </div>
                <div className="text-green-600 text-sm font-medium">{region.growth}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 热销商品排行 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">热销商品排行</h2>
              <p className="text-sm text-gray-500 mt-1">Top 5 商品</p>
            </div>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              查看All
            </button>
          </div>
          <div className="space-y-4">
            {topProducts.map((product, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                  index === 0 ? 'bg-gradient-to-br from-yellow-400 to-orange-500 text-white' :
                  index === 1 ? 'bg-gray-200 text-gray-700' :
                  index === 2 ? 'bg-orange-100 text-orange-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">{product.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <PlatformIcon platform={product.platform} />
                    <span className="text-xs text-gray-500">{product.orders} 订单</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{product.sales}</div>
                  <div className="text-green-600 text-xs font-medium">{product.growth}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
