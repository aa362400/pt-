import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  FileSearch,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
} from 'lucide-react';
import { listingsApi, type ListingDraft } from '../api/listings';
import { useToast } from '../components/ui/use-toast';
import ListingGenerator from '../pages/ListingGenerator';

export default function ListingOverviewV2() {
  const { addToast } = useToast();
  const [items, setItems] = useState<ListingDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listingsApi.list({ limit: 100 });
      setItems(result.items);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Listing 读取失败', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const openEditor = (listingId: string | null) => {
    setSelectedListingId(listingId);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setSelectedListingId(null);
    void load();
  };

  if (editorOpen) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <button type="button" onClick={closeEditor} className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:text-blue-900">
              <ArrowLeft className="h-4 w-4" />返回刊登列表
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{selectedListingId ? '编辑 Listing' : '创建 Listing'}</h1>
            <p className="mt-1 text-gray-500">当前操作就在新版刊登页面内完成，不再进入旧工作台。</p>
          </div>
        </div>
        <ListingGenerator initialListingId={selectedListingId} />
      </div>
    );
  }

  const drafts = items.filter((item) => item.status === 'draft').length;
  const completed = items.filter((item) => item.status === 'completed').length;
  const published = items.filter((item) => item.status === 'published').length;

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">刊登与 SEO</h1>
          <p className="mt-1 text-gray-500">管理真实 Listing 草稿、标题、要点和 SEO 标签</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => void load()} className="rounded-lg border border-gray-300 p-2.5" aria-label="刷新" title="刷新 Listing">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={() => openEditor(null)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-medium text-white">
            <Plus className="h-4 w-4" />创建 Listing
          </button>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '草稿总数', value: items.length, icon: FileSearch },
          { label: '待编辑', value: drafts, icon: Sparkles },
          { label: '待审核', value: completed, icon: Search },
          { label: '已发布记录', value: published, icon: CheckCircle2 },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <card.icon className="mb-3 h-5 w-5 text-blue-600" />
            <div className="text-3xl font-bold text-gray-900">{card.value}</div>
            <div className="mt-1 text-sm text-gray-500">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-6 py-4"><h2 className="font-bold text-gray-900">Listing 草稿</h2></div>
        {loading ? (
          <div className="py-16 text-center text-sm text-gray-500">正在读取真实草稿...</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-500">暂无真实 Listing 草稿，不展示 Figma 示例</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-gray-50 text-left text-xs text-gray-500">
                <tr><th className="px-6 py-3">标题</th><th className="px-6 py-3">商品</th><th className="px-6 py-3">平台</th><th className="px-6 py-3">SEO 标签</th><th className="px-6 py-3">状态</th><th className="px-6 py-3">操作</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map((item) => (
                  <tr key={item.id} className="text-sm">
                    <td className="max-w-sm truncate px-6 py-4 font-medium text-gray-900">{item.title || '标题未生成'}</td>
                    <td className="px-6 py-4 text-gray-600">{item.productName}</td>
                    <td className="px-6 py-4">{item.platform || '未设置'}</td>
                    <td className="px-6 py-4 text-gray-500">{item.seoTags?.length ?? 0} 个</td>
                    <td className="px-6 py-4">{item.status}</td>
                    <td className="px-6 py-4"><button type="button" onClick={() => openEditor(item.id)} className="text-blue-600 hover:underline">打开编辑器</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
