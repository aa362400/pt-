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
  const [dateRange, setDateRange] = useState('7text');

  // textdata
  const salesData = [
    { date: '07/06', sales: 2850, orders: 68, profit: 1140 },
    { date: '07/07', sales: 2980, orders: 72, profit: 1192 },
    { date: '07/08', sales: 2900, orders: 65, profit: 1160 },
    { date: '07/09', sales: 3300, orders: 82, profit: 1320 },
    { date: '07/10', sales: 3540, orders: 88, profit: 1416 },
    { date: '07/11', sales: 3350, orders: 79, profit: 1340 },
    { date: '07/12', sales: 3842, orders: 95, profit: 1537 },
  ];

  // platformtextdata
  const platformData = [
    { name: 'Etsy', value: 42, color: '#F97316' },
    { name: 'Amazon', value: 28, color: '#3B82F6' },
    { name: 'Shopify', value: 18, color: '#10B981' },
    { name: 'TikTok', value: 12, color: '#EC4899' },
  ];

  // english_text
  const regionData = [
    { region: 'text', sales: 12450, orders: 340, growth: '+15.2%' },
    { region: 'text', sales: 5680, orders: 156, growth: '+8.5%' },
    { region: 'english_text', sales: 4320, orders: 118, growth: '+12.8%' },
    { region: 'english_text', sales: 3890, orders: 102, growth: '+6.3%' },
    { region: 'text', sales: 2560, orders: 72, growth: '+4.1%' },
  ];

  // textproduct
  const topProducts = [
    { name: 'english_text', sales: '$2,450', orders: 86, platform: 'Etsy', growth: '+28%' },
    { name: 'english_text', sales: '$1,890', orders: 124, platform: 'Shopify', growth: '+15%' },
    { name: 'english_text', sales: '$1,650', orders: 45, platform: 'Etsy', growth: '+32%' },
    { name: 'english_text', sales: '$1,420', orders: 38, platform: 'Amazon', growth: '+12%' },
    { name: 'english_text', sales: '$980', orders: 156, platform: 'TikTok', growth: '+45%' },
  ];

  const stats = [
    { label: 'textsales', value: '$26,842', change: '+18.5%', trend: 'up', icon: DollarSign },
    { label: 'textorderstext', value: '856', change: '+12.3%', trend: 'up', icon: ShoppingBag },
    { label: 'english_text', value: '$31.36', change: '+5.2%', trend: 'up', icon: Users },
    { label: 'Activeproduct', value: '1,248', change: '+24', trend: 'up', icon: Package },
  ];

  return (
    <div className="p-8">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Data Analysis</h1>
        <p className="text-gray-500 mt-1">english_textData Analysis，AI english_text，english_text</p>
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

      {/* AI english_text */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-8 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-3">AI english_text</h3>
            <div className="space-y-3">
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">📈 english_text</h4>
                    <p className="text-sm text-gray-700">
                      text 7 text，Etsy english_text<strong>english_textproduct</strong>english_text <strong className="text-green-600">23%</strong>，
                      english_textConversion ratetext 1.2%。english_text，english_textConversion ratetext 5.5%。
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <TrendingDown className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">⚠️ english_text</h4>
                    <p className="text-sm text-gray-700">
                      TikTok Shop text<strong>english_text</strong>textorderstext，textprofittext <strong className="text-orange-600">12%</strong>，
                      textplatformenglish_text。english_textcosttext。
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-gray-900 mb-1">💡 english_text</h4>
                    <p className="text-sm text-gray-700">
                      detectiontext <strong>8 textproduct</strong>yesenglish_textnonetext。AI english_texttitlekeywords、english_text，
                      english_text <strong className="text-blue-600">$150-200/text</strong> sales。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <button className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium border border-gray-200">
            generationreport
          </button>
        </div>
      </div>

      {/* english_text */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        {/* english_text */}
        <div className="col-span-2 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">english_textprofittext</h2>
              <p className="text-sm text-gray-500 mt-1">english_text</p>
            </div>
            <div className="flex items-center gap-2">
              {['7text', '30text', '90text'].map((period) => (
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
              <Line type="monotone" dataKey="sales" stroke="#3B82F6" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* platformtext */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-gray-900">platformenglish_text</h2>
            <p className="text-sm text-gray-500 mt-1">textplatformenglish_text</p>
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

      {/* english_textproduct */}
      <div className="grid grid-cols-2 gap-6">
        {/* english_text */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">english_text</h2>
              <p className="text-sm text-gray-500 mt-1">textsalestext</p>
            </div>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              textAll
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
                  <div className="text-xs text-gray-500">{region.orders} orders</div>
                </div>
                <div className="text-green-600 text-sm font-medium">{region.growth}</div>
              </div>
            ))}
          </div>
        </div>

        {/* textproducttext */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">textproducttext</h2>
              <p className="text-sm text-gray-500 mt-1">Top 5 product</p>
            </div>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              textAll
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
                    <span className="text-xs text-gray-500">{product.orders} orders</span>
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
