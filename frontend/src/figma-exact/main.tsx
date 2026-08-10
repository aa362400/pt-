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

// english_text
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
  const [activeNav, setActiveNav] = useState('Operations Overview');
  const [operationMode, setOperationMode] = useState<'semi' | 'full'>('semi');
  const [showModeModal, setShowModeModal] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('All');
  const [showAIAssistant, setShowAIAssistant] = useState(false);

  const navItems = [
    { icon: LayoutDashboard, label: 'Operations Overview' },
    { icon: Bot, label: 'AI Agent Center' },
    { icon: Package, label: 'Product Management' },
    { icon: FileText, label: 'Listings and SEO' },
    { icon: Image, label: 'Content and Media' },
    { icon: TrendingUp, label: 'Marketing Ads' },
    { icon: ShoppingCart, label: 'Order Management' },
    { icon: MessageSquare, label: 'Customer Service' },
    { icon: BarChart3, label: 'Data Analysis' },
    { icon: CheckSquare, label: 'Approval Center', badge: 27 },
    { icon: Workflow, label: 'Automation Flow' },
    { icon: Link2, label: 'Platform Connections' },
    { icon: Users, label: 'Team and Settings' },
  ];

  const renderPage = () => {
    switch (activeNav) {
      case 'Operations Overview':
        return <Dashboard />;
      case 'AI Agent Center':
        return <AIAgentCenter agents={[]} stats={[]} />;
      case 'Product Management':
        return <ProductManagement products={[]} stats={[]} />;
      case 'Content and Media':
        return <ContentAndMedia stats={[]} recentAssets={[]} />;
      case 'Order Management':
        return <OrderManagement orders={[]} stats={[]} />;
      case 'Customer Service':
        return <CustomerService conversations={[]} stats={[]} />;
      case 'Data Analysis':
        return <DataAnalysis />;
      case 'Approval Center':
        return <ApprovalCenter approvalTasks={[]} stats={[]} />;
      case 'Automation Flow':
        return <AutomationFlow automationFlows={[]} stats={[]} />;
      case 'Platform Connections':
        return <PlatformConnection platforms={[]} stats={[]} />;
      case 'Team and Settings':
        return <TeamSettings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Left navigation */}
      <div className="w-64 bg-slate-900 text-white flex flex-col">
        {/* Logo */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-lg">GlobalPilot AI</div>
              <div className="text-xs text-slate-400">ShopMate AI</div>
            </div>
          </div>
        </div>

        {/* Navigation menu */}
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

        {/* textusertext */}
        <div className="p-4 border-t border-slate-800">
          <div className="text-xs text-slate-400">english_text：v2.4.1</div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* english_text */}
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            {/* text：english_textplatformFilter */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-500">textstore：</div>
                <button className="flex items-center gap-2 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50">
                  <span className="font-medium">Jieke Design Studio</span>
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                {['All', 'Etsy', 'Shopify', 'Amazon', 'TikTok'].map((platform) => (
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
                <span className="text-sm">text 7 text</span>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* text：search、notification、user */}
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="textsearch..."
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

          {/* english_text */}
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
                textautomatictext
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
                textautomatictext
              </button>
            </div>
            <div className="ml-4 text-sm text-gray-500">
              {operationMode === 'semi' ? 'AI generationplan，english_texthumantext' : 'AI english_textautomaticenglish_textyestask'}
            </div>
          </div>
        </div>

        {/* english_text */}
        <div className="flex-1 overflow-y-auto">
          {renderPage()}
        </div>
      </div>

      {/* textautomaticenglish_text */}
      {showModeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">english_textautomatictext</h3>
                <p className="text-gray-600">AI english_textautomaticenglish_textyestask，nonetexthumantext</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-6 mb-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-700">textAd budgettext</span>
                <span className="font-bold text-gray-900">$500</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">textPrice changetext</span>
                <span className="font-bold text-gray-900">±15%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">automaticRefundtext</span>
                <span className="font-bold text-gray-900">$50</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-700">productautomaticpublish</span>
                <span className="font-bold text-green-600">✓ text</span>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-lg mb-6">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <strong>english_text：</strong>english_textautomatictext，english_textautomaticenglish_text。High risktext（english_textRefund、IP risk）english_textnotification。
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
                english_text
              </button>
              <button
                onClick={() => setShowModeModal(false)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                text
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI english_text */}
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
              <h3 className="font-bold text-gray-900">AI english_text</h3>
            </div>
            <button onClick={() => setShowAIAssistant(false)} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="p-4">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-900 mb-3">english_text？</p>
              <div className="space-y-2">
                {[
                  'english_textproduct',
                  'english_text Etsy textkeywords',
                  'textcostenglish_text',
                  'english_textprofitproduct',
                  'textAd budget',
                  'english_textapprovaltexttask',
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
                placeholder="inputenglish_text..."
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
