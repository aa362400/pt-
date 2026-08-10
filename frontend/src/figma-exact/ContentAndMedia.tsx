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
    { key: 'ai_studio', label: 'AI Creative Studio', icon: Sparkles },
    { key: 'library', label: 'Asset library', icon: ImageIcon },
    { key: 'products', label: 'Product images', icon: Package },
    { key: 'marketing', label: 'Marketing assets', icon: Layout },
    { key: 'videos', label: 'Video assets', icon: Video },
    { key: 'templates', label: 'Brand templates', icon: Grid },
    { key: 'history', label: 'Generation history', icon: History },
  ];

  const aiTools = [
    { id: 'generate', label: 'AI image generation', icon: Sparkles },
    { id: 'remove_bg', label: 'Remove background', icon: Scissors },
    { id: 'replace_bg', label: 'Replace background', icon: Layers },
    { id: 'cutout', label: 'Product cutout', icon: Crop },
    { id: 'scene_generation', label: 'Scene generation', icon: Wand2 },
    { id: 'white_bg', label: 'White-background main image', icon: ImageIcon },
    { id: 'expand', label: 'Image expansion', icon: Maximize },
    { id: 'retouch', label: 'Smart retouch', icon: Sparkles },
    { id: 'shadow', label: 'Shadow generation', icon: Layers },
    { id: 'mockup', label: 'Mockup', icon: Layout },
    { id: 'size_guide', label: 'Size guide', icon: Grid },
    { id: 'batch_resize', label: 'Batch size adaptation', icon: Zap },
  ];

  const generatedResults = recentAssets.filter((asset) => asset.image).slice(0, 4);
  const activeAsset = generatedResults[0] ?? null;

  const quickCommands = [
    'Change the background to a Christmas scene',
    'text Amazon White-background main image',
    'Generate a Pinterest long image',
    'Batch adapt sizes for all platforms',
    'Generate ad copy for this image',
  ];

  return (
    <div className="p-0 h-full">
      {/* Page title */}
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Content and Media</h1>
          <p className="text-gray-500 mt-1">text AI english_textProduct images、sceneenglish_textplatformMarketing assets</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedTab('ai_studio')} className="flex items-center gap-2 whitespace-nowrap px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Upload className="w-4 h-4 text-gray-600" />
            Upload assets
          </button>
          <button onClick={() => setSelectedTab('history')} className="flex items-center gap-2 whitespace-nowrap px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Zap className="w-4 h-4 text-gray-600" />
            Batch processing
          </button>
          <button onClick={() => setSelectedTab('ai_studio')} className="flex items-center gap-2 whitespace-nowrap px-5 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium">
            <Sparkles className="w-5 h-5" />
            AI creation
          </button>
        </div>
      </div>

      {/* Metric cards */}
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

      {/* english_text */}
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

        {/* AI Creative Studiotext */}
        {selectedTab === 'ai_studio' && (
          studioPanel ? <div className="p-4 lg:p-6">{studioPanel}</div> : <div>
            {/* english_text */}
            <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-12 lg:p-6">
              {/* textToolbar */}
              <div className="lg:col-span-2">
                <h3 className="font-bold text-gray-900 mb-4 text-sm">AI text</h3>
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

              {/* english_text */}
              <div className="lg:col-span-6">
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
                  {/* Toolbar */}
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
                        english_text
                      </button>
                      <button onClick={onOpenOperations} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                        <Save className="w-4 h-4 inline mr-1" />
                        english_text
                      </button>
                      <button onClick={onOpenOperations} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                        <Download className="w-4 h-4 inline mr-1" />
                        text
                      </button>
                    </div>
                  </div>

                  {/* text */}
                  <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 aspect-square flex items-center justify-center relative overflow-hidden">
                    {/* textbackground */}
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
                        english_textrealproducttext
                      </button>
                    )}
                  </div>

                  {/* generationenglish_text */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900 text-sm">AI generationtext</h4>
                      <span className="text-xs text-gray-500">english_text</span>
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

              {/* english_text */}
              <div className="lg:col-span-4">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900 mb-4">AI creationtext</h3>

                  {/* textinputtext */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">english_text</label>
                    <textarea
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none text-sm"
                      rows={4}
                      placeholder="inputrealproductenglish_textscenetext"
                    />
                  </div>

                  {/* textitems */}
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">scenetext</label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                        <option>english_text</option>
                        <option>english_text</option>
                        <option>english_text</option>
                        <option>english_text</option>
                        <option>english_text</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">text</label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                        <option>english_text</option>
                        <option>english_text</option>
                        <option>english_text</option>
                        <option>english_text</option>
                        <option>english_text</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">text</label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                        <option>producttext</option>
                        <option>english_text</option>
                        <option>english_text</option>
                        <option>english_text</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">imagetext</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-2">generationtext</label>
                      <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
                        <option>4 text</option>
                        <option>2 text</option>
                        <option>6 text</option>
                        <option>8 text</option>
                      </select>
                    </div>

                    {/* english_textitems */}
                    <div className="space-y-3 pt-2">
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-700">textproducttext</span>
                        <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-700">textproducttext</span>
                        <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-700">automaticgenerationrealtext</span>
                        <input type="checkbox" defaultChecked className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </label>
                      <label className="flex items-center justify-between cursor-pointer">
                        <span className="text-sm text-gray-700">english_text</span>
                        <input type="checkbox" className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      </label>
                    </div>
                  </div>

                  {/* generationtext */}
                  <button
                    onClick={onOpenOperations}
                    className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-shadow font-medium flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-5 h-5" />
                    generationimage
                  </button>

                  <div className="mt-6 border-t border-gray-200 pt-6 text-sm text-gray-500">
                    imageenglish_textrealgenerationtext；english_textpassedtext。
                  </div>
                </div>
              </div>
            </div>

            {/* english_text */}
            <div className="border-t border-gray-200 p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-gray-900">english_text</h3>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="searchtext..."
                      className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    />
                  </div>
                  <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                    <Filter className="w-4 h-4 text-gray-500" />
                    Filter
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

              {/* english_text */}
              {loading && <div className="py-12 text-center text-sm text-gray-500">textreadrealtextitemstext...</div>}
              {!loading && recentAssets.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">
                  textnonerealenglish_text，english_text Figma textdata
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
                {recentAssets.map((asset) => (
                  <div key={asset.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group">
                    {/* imagetext */}
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

                    {/* english_text */}
                    <div className="p-4">
                      <h4 className="font-medium text-gray-900 text-sm mb-2 line-clamp-1">{asset.name}</h4>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                        <span>{asset.size}</span>
                        <span>{asset.type}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{asset.linkedProducts} textproduct</span>
                        {asset.status === 'approved' ? (
                          <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">textreview</span>
                        ) : asset.status === 'failed' ? (
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 rounded text-xs">generationfailed</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-orange-50 text-orange-700 rounded text-xs">textreview</span>
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
              <h3 className="font-bold text-gray-900">realenglish_textGeneration history</h3>
              <span className="text-sm text-gray-500">text {recentAssets.length} text</span>
            </div>
            {loading ? <div className="py-12 text-center text-sm text-gray-500">textreadrealtextitemstext...</div> : recentAssets.length === 0 ? <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-500">textnonerealenglish_text</div> : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {recentAssets.map((asset) => <a key={asset.id} href={asset.image ?? undefined} target={asset.image ? '_blank' : undefined} rel="noreferrer" className="overflow-hidden rounded-xl border border-gray-200 bg-white hover:shadow-lg">
                  <div className="aspect-square bg-gray-100">{asset.image ? <img src={asset.image} alt={asset.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><FileImage className="h-12 w-12 text-gray-300" /></div>}</div>
                  <div className="p-3"><p className="truncate text-sm font-medium text-gray-900">{asset.name}</p><p className="mt-1 text-xs text-gray-500">{asset.type} · {asset.status === 'approved' ? 'textDone' : asset.status === 'failed' ? 'failed' : 'Processing'}</p></div>
                </a>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI english_text */}
      {showAIAssistant && (
        <div className="fixed bottom-8 right-8 hidden w-96 bg-white rounded-xl shadow-2xl border border-gray-200 z-40 xl:block">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <h3 className="font-bold text-gray-900">AI english_text</h3>
            </div>
            <button onClick={() => setShowAIAssistant(false)} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>

          <div className="p-4">
            <p className="text-sm text-gray-600 mb-4">english_text</p>
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
                placeholder="inputenglish_text..."
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
