import React from 'react';
import {
  Clock,
  Play,
  Pause,
  Eye,
  DollarSign,
  ShoppingBag,
  Target,
  TrendingUp,
  Zap,
  Package,
  AlertCircle,
  TrendingUp as TrendingUpIcon,
  TrendingDown,
  Bot,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// 平台图标组件
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

// 模拟销售数据
const salesData = [
  { date: '07/06', Etsy: 820, Shopify: 450, Amazon: 1200, TikTok: 380 },
  { date: '07/07', Etsy: 890, Shopify: 520, Amazon: 1150, TikTok: 420 },
  { date: '07/08', Etsy: 750, Shopify: 480, Amazon: 1280, TikTok: 390 },
  { date: '07/09', Etsy: 920, Shopify: 610, Amazon: 1320, TikTok: 450 },
  { date: '07/10', Etsy: 1050, Shopify: 580, Amazon: 1400, TikTok: 510 },
  { date: '07/11', Etsy: 980, Shopify: 640, Amazon: 1250, TikTok: 480 },
  { date: '07/12', Etsy: 1120, Shopify: 720, Amazon: 1450, TikTok: 552 },
];

export function Dashboard() {
  const stats = [
    { label: '今日销售额', value: '$3,842', change: '+12.5%', trend: 'up', icon: DollarSign },
    { label: '今日订单', value: '126', change: '+8.3%', trend: 'up', icon: ShoppingBag },
    { label: '转化率', value: '4.8%', change: '+0.3%', trend: 'up', icon: Target },
    { label: '广告支出', value: '$386', change: '-5.2%', trend: 'down', icon: TrendingUp },
    { label: '广告 ROAS', value: '5.7', change: '+0.8', trend: 'up', icon: Zap },
    { label: '在线商品', value: '1,248', change: '+24', trend: 'up', icon: Package },
    { label: '待处理异常', value: '8', change: '-3', trend: 'down', icon: AlertCircle },
  ];

  const agents = [
    {
      name: '选品 Agent',
      status: '正在分析 Etsy 热门关键词',
      progress: 78,
      completedToday: 12,
      running: true,
    },
    {
      name: '刊登 Agent',
      status: '正在优化 24 个商品标题和标签',
      progress: 45,
      completedToday: 18,
      running: true,
    },
    {
      name: '客服 Agent',
      status: '已自动回复 36 条消息，2 条等待人工确认',
      progress: 100,
      completedToday: 36,
      running: true,
    },
    {
      name: '广告 Agent',
      status: '发现 3 个低回报广告组，建议降低预算',
      progress: 100,
      completedToday: 8,
      running: false,
    },
    {
      name: '库存 Agent',
      status: '检测到 5 个商品存在断货风险',
      progress: 100,
      completedToday: 5,
      running: false,
    },
  ];

  const aiActivities = [
    { time: '09:15', action: '优化了 18 个 Etsy 商品标题', platform: 'Etsy', result: '完成' },
    { time: '10:30', action: '为 6 个新品生成了图片和描述', platform: 'Shopify', result: '完成' },
    { time: '11:20', action: '暂停了 2 个低 ROAS 广告', platform: 'Amazon', result: '完成' },
    { time: '13:45', action: '自动回复了 12 条客户消息', platform: 'Etsy', result: '完成' },
    { time: '15:10', action: '检测到 3 个可能侵权的关键词', platform: 'TikTok', result: '警告' },
    { time: '16:00', action: '为美国市场调整了 8 个商品价格', platform: 'Shopify', result: '完成' },
  ];

  const approvalTasks = [
    {
      id: 1,
      title: '发布 12 个新 Etsy 商品',
      risk: 'medium',
      reason: 'AI 识别到热门品类，建议立即发布抢占市场',
      impact: '预计新增 $200-300/日销售额',
      platform: 'Etsy',
      time: '2小时前',
    },
    {
      id: 2,
      title: '将 5 个商品价格提高 8%',
      risk: 'low',
      reason: '竞品价格上涨，且用户需求强劲',
      impact: '预计利润率提升 6%',
      platform: 'Shopify',
      time: '3小时前',
    },
    {
      id: 3,
      title: '将广告每日预算从 $30 调整到 $45',
      risk: 'medium',
      reason: 'ROAS 稳定在 5.2，可扩大投放',
      impact: '预计新增 $75/日销售额',
      platform: 'Amazon',
      time: '5小时前',
    },
  ];

  const platforms = [
    {
      name: 'Etsy',
      connected: true,
      sales: '$1,842',
      orders: 52,
      products: 486,
      messages: 12,
      issues: 2,
      lastSync: '2分钟前',
    },
    {
      name: 'Shopify',
      connected: true,
      sales: '$890',
      orders: 28,
      products: 324,
      messages: 5,
      issues: 1,
      lastSync: '5分钟前',
    },
    {
      name: 'Amazon',
      connected: true,
      sales: '$856',
      orders: 35,
      products: 298,
      messages: 8,
      issues: 4,
      lastSync: '3分钟前',
    },
    {
      name: 'TikTok',
      connected: true,
      sales: '$254',
      orders: 11,
      products: 140,
      messages: 3,
      issues: 1,
      lastSync: '1分钟前',
    },
  ];

  const riskColors = {
    low: 'text-green-600 bg-green-50 border-green-200',
    medium: 'text-orange-600 bg-orange-50 border-orange-200',
    high: 'text-red-600 bg-red-50 border-red-200',
  };

  const riskLabels = {
    low: '低风险',
    medium: '中风险',
    high: '高风险',
  };

  return (
    <div className="p-8">
      {/* 核心数据卡片 */}
      <div className="grid grid-cols-7 gap-4 mb-8">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                stat.trend === 'up' ? 'bg-blue-50' : 'bg-gray-50'
              }`}>
                <stat.icon className={`w-5 h-5 ${
                  stat.trend === 'up' ? 'text-blue-600' : 'text-gray-600'
                }`} />
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${
                stat.trend === 'up' ? 'text-green-600' : 'text-gray-600'
              }`}>
                {stat.trend === 'up' ? <TrendingUpIcon className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {stat.change}
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 销售趋势图 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">销售与利润趋势</h2>
            <p className="text-sm text-gray-500 mt-1">多平台销售额对比分析</p>
          </div>
          <div className="flex items-center gap-2">
            {['7天', '30天', '90天'].map((period) => (
              <button
                key={period}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                  period === '7天'
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
          <AreaChart data={salesData}>
            <defs>
              <linearGradient id="colorEtsy" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F97316" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#F97316" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorShopify" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorAmazon" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorTikTok" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EC4899" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#EC4899" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" stroke="#9CA3AF" style={{ fontSize: '12px' }} />
            <YAxis stroke="#9CA3AF" style={{ fontSize: '12px' }} />
            <Tooltip />
            <Legend />
            <Area type="monotone" dataKey="Etsy" stroke="#F97316" fillOpacity={1} fill="url(#colorEtsy)" strokeWidth={2} />
            <Area type="monotone" dataKey="Shopify" stroke="#10B981" fillOpacity={1} fill="url(#colorShopify)" strokeWidth={2} />
            <Area type="monotone" dataKey="Amazon" stroke="#3B82F6" fillOpacity={1} fill="url(#colorAmazon)" strokeWidth={2} />
            <Area type="monotone" dataKey="TikTok" stroke="#EC4899" fillOpacity={1} fill="url(#colorTikTok)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-8 mb-8">
        {/* AI Agent 运行中心 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-600" />
                AI Agent 运行中心
              </h2>
              <p className="text-sm text-gray-500 mt-1">5 个智能助手正在为您工作</p>
            </div>
          </div>

          <div className="space-y-4">
            {agents.map((agent, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${agent.running ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                    <div>
                      <div className="font-medium text-gray-900">{agent.name}</div>
                      <div className="text-sm text-gray-500 mt-1">{agent.status}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="p-1.5 hover:bg-gray-100 rounded">
                      {agent.running ? <Pause className="w-4 h-4 text-gray-600" /> : <Play className="w-4 h-4 text-gray-600" />}
                    </button>
                    <button className="p-1.5 hover:bg-gray-100 rounded">
                      <Eye className="w-4 h-4 text-gray-600" />
                    </button>
                  </div>
                </div>

                {agent.progress < 100 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>执行进度</span>
                      <span>{agent.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`bg-gradient-to-r from-blue-500 to-purple-600 h-1.5 rounded-full transition-all`}
                        style={{ width: `${agent.progress}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">今日已完成 {agent.completedToday} 个任务</span>
                  <span className="text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    运行中
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 今日 AI 工作摘要 */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900">AI 今天帮你完成了什么</h2>
              <p className="text-sm text-gray-500 mt-1">实时工作日志</p>
            </div>
          </div>

          <div className="space-y-4">
            {aiActivities.map((activity, index) => (
              <div key={index} className="flex items-start gap-4 pb-4 border-b border-gray-100 last:border-0">
                <div className="flex-shrink-0 w-12 text-center">
                  <div className="text-sm font-medium text-gray-900">{activity.time}</div>
                </div>
                <div className="flex-shrink-0">
                  <PlatformIcon platform={activity.platform} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-gray-900">{activity.action}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">{activity.platform}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      activity.result === '完成' 
                        ? 'bg-green-50 text-green-700' 
                        : 'bg-orange-50 text-orange-700'
                    }`}>
                      {activity.result}
                    </span>
                  </div>
                </div>
                <button className="text-xs text-blue-600 hover:text-blue-700 flex-shrink-0">
                  查看详情
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 待审批任务 */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-gray-900">等待你的确认</h2>
            <span className="bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-medium">
              {approvalTasks.length}
            </span>
          </div>
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            批量审批
          </button>
        </div>

        <div className="space-y-3">
          {approvalTasks.map((task) => (
            <div key={task.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-medium text-gray-900">{task.title}</h3>
                    <span className={`text-xs px-2 py-1 rounded-full border ${riskColors[task.risk as keyof typeof riskColors]}`}>
                      {riskLabels[task.risk as keyof typeof riskLabels]}
                    </span>
                    <PlatformIcon platform={task.platform} />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">AI 推荐理由</div>
                      <div className="text-sm text-gray-700">{task.reason}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">预期影响</div>
                      <div className="text-sm text-gray-700">{task.impact}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>{task.time}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow text-sm font-medium">
                    批准
                  </button>
                  <button className="p-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 平台经营状态 */}
      <div className="grid grid-cols-4 gap-6">
        {platforms.map((platform, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <PlatformIcon platform={platform.name} />
                <div>
                  <div className="font-bold text-gray-900">{platform.name}</div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-xs text-gray-500">已连接</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-2xl font-bold text-gray-900">{platform.sales}</div>
                <div className="text-xs text-gray-500">今日销售额</div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500 text-xs">订单</div>
                  <div className="font-medium text-gray-900">{platform.orders}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">商品</div>
                  <div className="font-medium text-gray-900">{platform.products}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">消息</div>
                  <div className="font-medium text-gray-900">{platform.messages}</div>
                </div>
                <div>
                  <div className="text-gray-500 text-xs">异常</div>
                  <div className="font-medium text-red-600">{platform.issues}</div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <Clock className="w-3 h-3" />
                  <span>同步于 {platform.lastSync}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
