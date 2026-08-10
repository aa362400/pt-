import React, { useState } from 'react';
import {
  Upload,
  Sparkles,
  Image as ImageIcon,
  Wand2,
  Scissors,
  Crop,
  Layers,
  Zap,
  Grid,
  List,
  Search,
  Filter,
  Download,
  Heart,
  MoreVertical,
  Check,
  Eye,
  Undo,
  Redo,
  ZoomIn,
  ZoomOut,
  Move,
  Save,
  TrendingUp,
  Package,
  FileImage,
  Video,
  Layout,
  History,
  Maximize,
  X,
} from 'lucide-react';

export interface ContentAndMediaStat {
  label: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: typeof ImageIcon;
}

export interface ContentAndMediaAsset {
  id: string;
  name: string;
  image: string | null;
  size: string;
  type: string;
  linkedProducts: number | string;
  isAI: boolean;
  status: 'approved' | 'pending' | 'failed';
  platform: string;
}

interface ContentAndMediaProps {
  stats: ContentAndMediaStat[];
  recentAssets: ContentAndMediaAsset[];
  loading?: boolean;
  studioPanel?: React.ReactNode;
}

export function ContentAndMedia({ stats, recentAssets, loading = false, studioPanel }: ContentAndMediaProps) {
  const [selectedTab, setSelectedTab] = useState('ai_studio');
  const [selectedTool, setSelectedTool] = useState('scene_generation');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showAIAssistant, setShowAIAssistant] = useState(true);
  const onOpenOperations = () => setSelectedTab('ai_studio');

  const tabs = [
    { key: 'ai_studio', label: 'AI 创意工作台', icon: Sparkles },
    { key: 'library', label: '素材库', icon: ImageIcon },
    { key: 'products', label: '商品图片', icon: Package },
    { key: 'marketing', label: '营销素材', icon: Layout },
    { key: 'videos', label: '视频素材', icon: Video },
    { key: 'templates', label: '品牌模板', icon: Grid },
    { key: 'history', label: '生成记录', icon: History },
  ];

  const aiTools = [
    { id: 'generate', label: 'AI 生成图片', icon: Sparkles },
    { id: 'remove_bg', label: '删除背景', icon: Scissors },
    { id: 'replace_bg', label: '替换背景', icon: Layers },
    { id: 'cutout', label: '商品抠图', icon: Crop },
    { id: 'scene_generation', label: '场景生成', icon: Wand2 },
    { id: 'white_bg', label: '白底主图', icon: ImageIcon },
    { id: 'expand', label: '图片扩展', icon: Maximize },
    { id: 'retouch', label: '智能修图', icon: Sparkles },
    { id: 'shadow', label: '阴影生成', icon: Layers },
    { id: 'mockup', label: 'Mockup 样机', icon: Layout },
    { id: 'size_guide', label: '尺寸说明图', icon: Grid },
    { id: 'batch_resize', label: '批量尺寸适配', icon: Zap },
  ];

  const generatedResults = recentAssets.filter((asset) => asset.image).slice(0, 4);
  const activeAsset = generatedResults[0] ?? null;

  const quickCommands = [
    '把背景换成圣诞场景',
    '制作 Amazon 白底主图',
    '生成 Pinterest 长图',
    '批量适配所有平台尺寸',
    '为这张图片生成广告文案',
  ];

  return (
    <div className="p-0 h-full">
      {/* 页面标题 */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">内容与图片</h1>
          <p className="text-gray-500 mt-1">使用 AI 快速制作商品图片、场景图和多平台营销素材</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedTab('ai_studio')} className="flex items-center gap-2 whitespace-nowrap px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Upload className="w-4 h-4 text-gray-600" />
            上传素材
          </button>
          <button onClick={() => setSelectedTab('history')} className="flex items-center gap-2 whitespace-nowrap px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Zap className="w-4 h-4 text-gray-600" />
            批量处理
          </button>
          <button onClick={() => setSelectedTab('ai_studio')} className="flex items-center gap-2 whitespace-nowrap px-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium">
            <Sparkles className="w-5 h-5" />
            AI 创作
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 gap-4 mb-8 sm:grid-cols-2 xl:grid-cols-5 xl:gap-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <div className={`w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center`}>
                <stat.icon className="w-5 h-5 text-blue-600" />
              </div>
              <div className={`flex items-center gap-1 text-xs font-medium ${
                stat.trend === 'up' ? 'text-green-600' : 'text-gray-600'
              }`}>
                {stat.trend === 'up' ? <TrendingUp className="w-3 h-3" /> : null}
                {stat.change}
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
            <div className="text-xs text-gray-500">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* 标签导航 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-8">
        <div className="flex items-center border-b border-gray-200 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={`flex items-center gap-2 px-6 py-4 font-medium text-sm transition-colors relative whitespace-nowrap ${
                selectedTab === tab.key
                  ? 'text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {selectedTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600"></div>
              )}
            </button>
          ))}
        </div>

        {/* AI 创意工作台内容 */}
        {selectedTab === 'ai_studio' && (
          studioPanel ? <div className="p-4 lg:p-6">{studioPanel}</div> : <div>
            {/* 三栏布局 */}
            <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-12 lg:p-6">
              {/* 左侧工具栏 */}
              <div className="lg:col-span-2">
                <h3 className="font-bold text-gray-900 mb-4 text-sm">AI 工具</h3>
                <div className="space-y-1">
                  {aiTools.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => setSelectedTool(tool.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        selectedTool === tool.id
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <tool.icon className="w-4 h-4" />
                      {tool.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 中间画布区域 */}
              <div className="lg:col-span-6">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  {/* 工具栏 */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <button onClick={onOpenOperations} className="p-2 hover:bg-white rounded-lg border border-gray-300">
                        <Undo className="w-4 h-4 text-gray-600" />
                      </button>
                      <button onClick={onOpenOperations} className="p-2 hover:bg-white rounded-lg border border-gray-300">
                        <Redo className="w-4 h-4 text-gray-600" />
                      </button>
                      <div className="w-px h-6 bg-gray-300 mx-2"></div>
                      <button onClick={onOpenOperations} className="p-2 hover:bg-white rounded-lg border border-gray-300">
                        <ZoomOut className="w-4 h-4 text-gray-600" />
                      </button>
                      <span className="text-sm text-gray-600 px-2">100%</span>
                      <button onClick={onOpenOperations} className="p-2 hover:bg-white rounded-lg border border-gray-300">
                        <ZoomIn className="w-4 h-4 text-gray-600" />
                      </button>
                      <div className="w-px h-6 bg-gray-300 mx-2"></div>
                      <button onClick={onOpenOperations} className="p-2 hover:bg-white rounded-lg border border-gray-300">
                        <Move className="w-4 h-4 text-gray-600" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={onOpenOperations} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        <Eye className="w-4 h-4 inline mr-1" />
                        对比原图
                      </button>
                      <button onClick={onOpenOperations} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        <Save className="w-4 h-4 inline mr-1" />
                        保存版本
                      </button>
                      <button onClick={onOpenOperations} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                        <Download className="w-4 h-4 inline mr-1" />
                        下载
                      </button>
                    </div>
                  </div>

                  {/* 画布 */}
                  <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 aspect-square flex items-center justify-center relative overflow-hidden">
                    {/* 网格背景 */}
                    <div className="absolute inset-0" style={{
                      backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(0, 0, 0, .05) 25%, rgba(0, 0, 0, .05) 26%, transparent 27%, transparent 74%, rgba(0, 0, 0, .05) 75%, rgba(0, 0, 0, .05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(0, 0, 0, .05) 25%, rgba(0, 0, 0, .05) 26%, transparent 27%, transparent 74%, rgba(0, 0, 0, .05) 75%, rgba(0, 0, 0, .05) 76%, transparent 77%, transparent)',
                      backgroundSize: '50px 50px'
                    }}></div>

                    {activeAsset?.image ? (
                      <div className="relative z-10 h-[min(20rem,70vw)] w-[min(20rem,70vw)] overflow-hidden rounded-lg bg-white shadow-lg">
                        <img src={activeAsset.image} alt={activeAsset.name} className="h-full w-full object-contain" />
                        <div className="absolute inset-4 border border-blue-400 border-dashed rounded pointer-events-none" />
                        <div className="absolute left-1/2 top-2 -translate-x-1/2 rounded bg-blue-600 px-2 py-1 text-xs text-white">
                          {activeAsset.size}
                        </div>
                      </div>
                    ) : (
                      <button onClick={onOpenOperations} className="relative z-10 flex flex-col items-center gap-3 text-sm text-gray-500">
                        <Upload className="h-10 w-10 text-gray-300" />
                        进入业务工作台上传真实商品图
                      </button>
                    )}
                  </div>

                  {/* 生成结果缩略图 */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900 text-sm">AI 生成结果</h4>
                      <span className="text-xs text-gray-500">选择一个应用到画布</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                      {generatedResults.map((result, index) => (
                        <div
                          key={result.id}
                          className={`bg-white rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
                            index === 0 ? 'border-blue-600' : 'border-gray-200 hover:border-blue-400'
                          }`}
                        >
                          <div className="aspect-square bg-gray-100 rounded-t-lg flex items-center justify-center relative overflow-hidden">
                            {result.image && <img src={result.image} alt={result.name} className="h-full w-full object-cover" />}
                            {index === 0 && (
                              <div className="absolute top-2 right-2 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            )}
                          </div>
                          <div className="p-2 text-xs text-center text-gray-600 line-clamp-1">{result.name}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 右侧设置面板 */}
              <div className="lg:col-span-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900 mb-4">AI 创作设置</h3>

                  {/* 描述输入框 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">创作描述</label>
                    <textarea
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                      rows={4}
                      placeholder="输入真实商品和目标场景描述"
                    />
                  </div>

                  {/* 设置项 */}
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">场景风格</label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                        <option>北欧家居</option>
                        <option>现代简约</option>
                        <option>工业风格</option>
                        <option>田园风格</option>
                        <option>极简主义</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">光线</label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                        <option>柔和自然光</option>
                        <option>明亮日光</option>
                        <option>温暖侧光</option>
                        <option>柔和顶光</option>
                        <option>戏剧性光影</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">构图</label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                        <option>商品居中</option>
                        <option>三分构图</option>
                        <option>对角线构图</option>
                        <option>留白构图</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">图片比例</label>
                      <div className="grid grid-cols-3 gap-2">
                        {['1:1', '4:3', '16:9'].map((ratio) => (
                          <button
                            key={ratio}
                            className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                              ratio === '1:1'
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300 hover:border-blue-600'
                            }`}
                          >
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">生成数量</label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                        <option>4 张</option>
                        <option>2 张</option>
                        <option>6 张</option>
                        <option>8 张</option>
                      </select>
                    </div>

                    {/* 开关选项 */}
                    <div className="space-y-3 pt-2">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-700">保持商品结构</span>
                        <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-700">保持商品颜色</span>
                        <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-700">自动生成真实阴影</span>
                        <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-700">去除多余文字</span>
                        <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </label>
                    </div>
                  </div>

                  {/* 生成按钮 */}
                  <button
                    onClick={onOpenOperations}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    生成图片
                  </button>

                  <div className="mt-6 border-t border-gray-200 pt-6 text-sm text-gray-500">
                    图片质量检查只展示真实生成结果；当前不预填通过结论。
                  </div>
                </div>
              </div>
            </div>

            {/* 最近素材区域 */}
            <div className="border-t border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-gray-900">最近素材</h3>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="搜索素材..."
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                    <Filter className="w-4 h-4 text-gray-500" />
                    筛选
                  </button>
                  <div className="flex items-center gap-1 border border-gray-300 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      <Grid className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 素材网格 */}
              {loading && <div className="py-12 text-center text-sm text-gray-500">正在读取真实素材项目...</div>}
              {!loading && recentAssets.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
                  暂无真实素材记录，不展示 Figma 演示数据
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
                {recentAssets.map((asset) => (
                  <div key={asset.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group">
                    {/* 图片预览 */}
                    <div className="aspect-square bg-gray-100 flex items-center justify-center relative overflow-hidden">
                      {asset.image ? (
                        <img src={asset.image} alt={asset.name} className="h-full w-full object-cover" />
                      ) : (
                        <FileImage className="h-12 w-12 text-gray-300" aria-hidden="true" />
                      )}
                      {asset.isAI && (
                        <div className="absolute top-2 left-2 px-2 py-1 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded text-xs flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          AI
                        </div>
                      )}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        <button className="p-1.5 bg-white rounded-lg shadow hover:bg-gray-50">
                          <Heart className="w-4 h-4 text-gray-600" />
                        </button>
                        <button className="p-1.5 bg-white rounded-lg shadow hover:bg-gray-50">
                          <MoreVertical className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    </div>

                    {/* 素材信息 */}
                    <div className="p-4">
                      <h4 className="font-medium text-gray-900 text-sm mb-2 line-clamp-1">{asset.name}</h4>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span>{asset.size}</span>
                        <span>{asset.type}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{asset.linkedProducts} 个商品</span>
                        {asset.status === 'approved' ? (
                          <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">已审核</span>
                        ) : asset.status === 'failed' ? (
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs">生成失败</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">待审核</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedTab !== 'ai_studio' && (
          <div className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-bold text-gray-900">真实素材与生成记录</h3>
              <span className="text-sm text-gray-500">共 {recentAssets.length} 条</span>
            </div>
            {loading ? <div className="py-12 text-center text-sm text-gray-500">正在读取真实素材项目...</div> : recentAssets.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">暂无真实素材记录</div> : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {recentAssets.map((asset) => <a key={asset.id} href={asset.image ?? undefined} target={asset.image ? '_blank' : undefined} rel="noreferrer" className="overflow-hidden rounded-xl border border-gray-200 bg-white hover:shadow-lg">
                  <div className="aspect-square bg-gray-100">{asset.image ? <img src={asset.image} alt={asset.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><FileImage className="h-12 w-12 text-gray-300" /></div>}</div>
                  <div className="p-3"><p className="truncate text-sm font-medium text-gray-900">{asset.name}</p><p className="mt-1 text-xs text-gray-500">{asset.type} · {asset.status === 'approved' ? '已完成' : asset.status === 'failed' ? '失败' : '处理中'}</p></div>
                </a>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI 创意助手 */}
      {showAIAssistant && (
        <div className="fixed bottom-8 right-8 hidden w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-40 xl:block">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-bold text-gray-900">AI 创意助手</h3>
            </div>
            <button onClick={() => setShowAIAssistant(false)} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">快捷指令</p>
            <div className="space-y-2">
              {quickCommands.map((command, index) => (
                <button
                  key={index}
                  onClick={onOpenOperations}
                  className="w-full text-left px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                >
                  {command}
                </button>
              ))}
            </div>

            <div className="mt-4 relative">
              <input
                type="text"
                placeholder="输入你的创意需求..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12 text-sm"
              />
              <button onClick={onOpenOperations} className="absolute right-2 top-1/2 transform -translate-y-1/2 p-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg">
                <Sparkles className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
