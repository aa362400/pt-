import React, { useState } from 'react';
import {
  Filter,
  Download,
  RefreshCw,
  Search,
  Eye,
  MoreVertical,
  Clock,
  Mail,
  Sparkles,
} from 'lucide-react';

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

export interface OrderManagementItem {
  id: string;
  orderId: string;
  platform: string;
  customer: string;
  email: string;
  products: number;
  amount: string;
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'issue' | 'refund';
  payment: string;
  shipping: string;
  aiAction: string | null;
  time: string;
  country: string;
}
export interface OrderManagementStat { label: string; value: string; icon: typeof Clock; color: string }
interface OrderManagementProps { orders: OrderManagementItem[]; stats: OrderManagementStat[]; loading?: boolean; onOpenOperations?: () => void }
export function OrderManagement({ orders, stats, loading = false, onOpenOperations }: OrderManagementProps) {
  const [selectedTab, setSelectedTab] = useState('all');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);

  const statusConfig = {
    pending: { label: '待处理', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    processing: { label: '处理中', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    shipped: { label: '已发货', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    delivered: { label: '已送达', color: 'bg-green-50 text-green-700 border-green-200' },
    issue: { label: '异常', color: 'bg-red-50 text-red-700 border-red-200' },
    refund: { label: '退款', color: 'bg-gray-50 text-gray-700 border-gray-200' },
  };

  const toggleOrder = (id: string) => {
    if (selectedOrders.includes(id)) {
      setSelectedOrders(selectedOrders.filter(orderId => orderId !== id));
    } else {
      setSelectedOrders([...selectedOrders, id]);
    }
  };

  const toggleAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(order => order.id));
    }
  };

  const visibleOrders = selectedTab === 'all'
    ? orders
    : orders.filter((order) => order.status === selectedTab);

  return (
    <div className="p-0">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">订单管理</h1>
        <p className="text-gray-500 mt-1">跨平台订单统一管理，AI 自动处理发货和客服</p>
      </div>

      {/* 统计卡片 */}
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

      {/* AI 建议卡片 */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6 mb-8 border border-blue-100">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-2">AI 智能建议</h3>
            <div className="space-y-2">
              {orders.filter((order) => order.aiAction).slice(0, 3).map((order) => (
                <div key={order.id} className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{order.orderId}：{order.aiAction}</span>
                </div>
              ))}
              {!loading && !orders.some((order) => order.aiAction) && <div className="text-sm text-gray-600">后端尚未返回真实订单 Agent 建议，不展示设计示例。</div>}
            </div>
          </div>
          <button onClick={onOpenOperations} className="px-4 py-2 bg-white text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium border border-gray-200">
            查看详情
          </button>
        </div>
      </div>

      {/* 主要内容区 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        {/* 工具栏 */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索订单号、客户名称..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-80 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              <button onClick={onOpenOperations} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                <Filter className="w-4 h-4 text-gray-500" />
                筛选
              </button>

              <button onClick={onOpenOperations} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                <RefreshCw className="w-4 h-4 text-gray-500" />
                刷新
              </button>
            </div>

            <div className="flex items-center gap-3">
              {selectedOrders.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">已选 {selectedOrders.length} 项</span>
                  <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                    批量发货
                  </button>
                  <button className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
                    导出
                  </button>
                </div>
              )}
              <button onClick={onOpenOperations} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                <Download className="w-4 h-4 text-gray-500" />
                导出订单
              </button>
            </div>
          </div>

          {/* 标签页 */}
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 -mb-6">
            {[
              { key: 'all', label: '全部订单', count: orders.length },
              { key: 'pending', label: '待处理', count: orders.filter((order) => order.status === 'pending').length },
              { key: 'processing', label: '处理中', count: orders.filter((order) => order.status === 'processing').length },
              { key: 'shipped', label: '已发货', count: orders.filter((order) => order.status === 'shipped').length },
              { key: 'delivered', label: '已送达', count: orders.filter((order) => order.status === 'delivered').length },
              { key: 'issue', label: '异常', count: orders.filter((order) => order.status === 'issue').length },
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

        {/* 订单表格 */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === orders.length}
                    onChange={toggleAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">订单号</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">客户信息</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">商品</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">金额</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">AI 处理</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">时间</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && <tr><td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-500">正在读取真实订单数据...</td></tr>}
              {!loading && orders.length === 0 && <tr><td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-500">当前没有真实订单记录，不展示 Figma 示例订单。</td></tr>}
              {visibleOrders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedOrders.includes(order.id)}
                      onChange={() => toggleOrder(order.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <PlatformIcon platform={order.platform} />
                      <div>
                        <div className="font-medium text-gray-900">{order.orderId}</div>
                        <div className="text-xs text-gray-500">{order.platform}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-gray-900">{order.customer}</div>
                      <div className="text-xs text-gray-500">{order.email}</div>
                      <div className="text-xs text-gray-400 mt-1">{order.country}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{order.products} 件商品</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{order.amount}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                      statusConfig[order.status as keyof typeof statusConfig].color
                    }`}>
                      {statusConfig[order.status as keyof typeof statusConfig].label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {order.aiAction ? (
                      <div className="flex items-start gap-2 max-w-xs">
                        <Sparkles className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-gray-600">{order.aiAction}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-500">{order.time}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button className="p-1.5 hover:bg-gray-100 rounded text-gray-600">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 hover:bg-gray-100 rounded text-gray-600">
                        <Mail className="w-4 h-4" />
                      </button>
                      <button className="p-1.5 hover:bg-gray-100 rounded text-gray-600">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            显示 {visibleOrders.length === 0 ? 0 : 1}-{visibleOrders.length} 条，共 {orders.length} 条真实订单
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
              上一页
            </button>
            <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm">1</button>
            <button className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">2</button>
            <button className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">3</button>
            <button className="px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
              下一页
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
