import React, { useState } from 'react';
import {
  LayoutDashboard,
  Bot,
  Package,
  FileText,
  Image,
  TrendingUp,
  ShoppingCart,
  MessageSquare,
  BarChart3,
  CheckSquare,
  Workflow,
  Link2,
  Users,
  Search,
  Bell,
  ChevronDown,
  Calendar,
  AlertTriangle,
  X,
  MessageCircle,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

// 导入各个页面组件
import { OrderManagement } from './OrderManagement';
import { CustomerService } from './CustomerService';
import { DataAnalysis } from './DataAnalysis';
import { ApprovalCenter } from './ApprovalCenter';
import { AutomationFlow } from './AutomationFlow';
import { PlatformConnection } from './PlatformConnection';
import { TeamSettings } from './TeamSettings';
import { Dashboard } from './Dashboard';
import { AIAgentCenter } from './AIAgentCenter';
import { ProductManagement } from './ProductManagement';
import { ContentAndMedia } from './ContentAndMedia';

export default function GlobalPilotAI() {
  const [activeNav, setActiveNav] = useState('运营总览');
  const [operationMode, setOperationMode] = useState<'semi' | 'full'>('semi');
  const [showModeModal, setShowModeModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('全部');
  const [showAIAssistant, setShowAIAssistant] = useState(false);

  const navItems = [
    { icon: LayoutDashboard, label: '运营总览' },
    { icon: Bot, label: 'AI Agent 中心' },
    { icon: Package, label: '商品管理' },
    { icon: FileText, label: '刊登与 SEO' },
    { icon: Image, label: '内容与图片' },
    { icon: TrendingUp, label: '营销广告' },
    { icon: ShoppingCart, label: '订单管理' },
    { icon: MessageSquare, label: '客户服务' },
    { icon: BarChart3, label: '数据分析' },
    { icon: CheckSquare, label: '审批中心', badge: 27 },
    { icon: Workflow, label: '自动化流程' },
    { icon: Link2, label: '平台连接' },
    { icon: Users, label: '团队与设置' },
  ];

  const renderPage = () => {
    switch (activeNav) {
      case '运营总览':
        return <Dashboard />;
      case 'AI Agent 中心':
        return <AIAgentCenter agents={[]} stats={[]} />;
      case '商品管理':
        return <ProductManagement products={[]} stats={[]} />;
      case '内容与图片':
        return <ContentAndMedia stats={[]} recentAssets={[]} />;
      case '订单管理':
        return <OrderManagement orders={[]} stats={[]} />;
      case '客户服务':
        return <CustomerService conversations={[]} stats={[]} />;
      case '数据分析':
        return <DataAnalysis />;
      case '审批中心':
        return <ApprovalCenter approvalTasks={[]} stats={[]} />;
      case '自动化流程':
        return <AutomationFlow automationFlows={[]} stats={[]} />;
      case '平台连接':
        return <PlatformConnection platforms={[]} stats={[]} />;
      case '团队与设置':
        return <TeamSettings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* 左侧导航栏 */}
      <div className="w-64 bg-slate-900 text-white flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-lg">GlobalPilot AI</div>
              <div className="text-xs text-slate-400">跨境智营</div>
            </div>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 overflow-y-auto py-4">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={() => setActiveNav(item.label)}
              className={`w-full px-6 py-3 flex items-center gap-3 transition-colors relative ${
                activeNav === item.label
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon className="w-5 h-5" />
              <span className="flex-1 text-left text-sm">{item.label}</span>
              {item.badge && (
                <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* 底部用户信息 */}
        <div className="p-4 border-t border-slate-800">
          <div className="text-xs text-slate-400">当前版本：v2.4.1</div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 顶部导航栏 */}
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            {/* 左侧：工作空间和平台筛选 */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-500">当前店铺：</div>
                <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
                  <span className="font-medium">Jieke Design Studio</span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {['全部', 'Etsy', 'Shopify', 'Amazon', 'TikTok'].map((platform) => (
                  <button
                    key={platform}
                    onClick={() => setSelectedPlatform(platform)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                      selectedPlatform === platform
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {platform}
                  </button>
                ))}
              </div>

              <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-sm">最近 7 天</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* 右侧：搜索、通知、用户 */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="全局搜索..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button className="relative p-2 hover:bg-gray-100 rounded-lg">
                <Bell className="w-5 h-5 text-gray-600" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
              </button>

              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-medium">
                JK
              </div>
            </div>
          </div>

          {/* 运营模式切换器 */}
          <div className="mt-4 flex items-center justify-center">
            <div className="inline-flex items-center gap-4 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => {
                  if (operationMode !== 'semi') {
                    setOperationMode('semi');
                  }
                }}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                  operationMode === 'semi'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                半自动模式
              </button>
              <button
                onClick={() => {
                  if (operationMode !== 'full') {
                    setShowModeModal(true);
                  }
                }}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all ${
                  operationMode === 'full'
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                全自动模式
              </button>
            </div>
            <div className="ml-4 text-sm text-gray-500">
              {operationMode === 'semi' ? 'AI 生成方案，关键操作需人工确认' : 'AI 在规则范围内自动执行所有任务'}
            </div>
          </div>
        </div>

        {/* 页面内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {renderPage()}
        </div>
      </div>

      {/* 全自动模式确认弹窗 */}
      {showModeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">切换到全自动模式</h3>
                <p className="text-gray-600">AI 将在以下规则范围内自动执行所有任务，无需人工确认</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">每日广告预算上限</span>
                <span className="font-bold text-gray-900">$500</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">单次价格调整幅度</span>
                <span className="font-bold text-gray-900">±15%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">自动退款限额</span>
                <span className="font-bold text-gray-900">$50</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">商品自动发布</span>
                <span className="font-bold text-green-600">✓ 启用</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg mb-6">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <strong>温馨提示：</strong>您随时可以切换回半自动模式，或在设置中调整自动化规则。高风险操作（如大额退款、侵权风险）仍会推送通知。
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setOperationMode('full');
                  setShowModeModal(false);
                }}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium"
              >
                确认切换
              </button>
              <button
                onClick={() => setShowModeModal(false)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI 运营助手 */}
      <button
        onClick={() => setShowAIAssistant(!showAIAssistant)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center z-40"
      >
        <MessageCircle className="w-6 h-6" />
      </button>

      {showAIAssistant && (
        <div className="fixed bottom-24 right-8 w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-40">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-gray-900">AI 运营助手</h3>
            </div>
            <button onClick={() => setShowAIAssistant(false)} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="p-4">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-900 mb-3">今天需要我帮你优化什么？</p>
              <div className="space-y-2">
                {[
                  '分析最近下降的商品',
                  '帮我找 Etsy 热门关键词',
                  '生成本周运营计划',
                  '检查低利润商品',
                  '优化广告预算',
                  '查看等待审批的任务',
                ].map((question, index) => (
                  <button
                    key={index}
                    className="w-full text-left px-3 py-2 bg-white rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="输入你的问题或指令..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
              />
              <button className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg">
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
