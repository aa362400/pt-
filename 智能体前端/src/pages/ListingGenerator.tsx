import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { FileText, List, Star, Tags, Globe, CheckCircle, RefreshCw, Edit3, Languages, MoreHorizontal, Download, Save, Sparkles, Bot, User, ChevronRight, Clock, Copy, Share2, MessageSquare } from 'lucide-react';
import Modal from '../components/ui/Modal.tsx';
import { useToast } from '../components/ui/use-toast.ts';
import { useTranslation } from 'react-i18next';
import { listingsApi, type ListingDraft } from '../api/listings';
import { api } from '../api/client';
import { createAgentRun, waitForAgentRun } from '../api/agentRuns';
import type { TitleCandidate, ListingPreview } from '../types';

interface WorkspaceSummary {
  id: string;
  name?: string;
}

interface AssistantAgentOutput {
  reply?: string;
  response?: string;
  result?: string;
  summary?: string;
}

type ListingModuleId = 'lm1' | 'lm2' | 'lm3' | 'lm4' | 'lm5' | 'lm6';

function csvCell(value: string | number | null | undefined) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function buildListingText(preview: ListingPreview) {
  return [
    `标题：${preview.title || '后端未返回'}`,
    `商品：${preview.productName || '后端未返回'}`,
    `平台：${preview.platform || '后端未返回'}`,
    `建议价格：${typeof preview.price === 'number' ? `$${preview.price}` : '后端未返回'}`,
    '',
    '五点描述：',
    ...(preview.bulletPoints.length > 0 ? preview.bulletPoints.map((item) => `- ${item}`) : ['后端未返回']),
    '',
    `SEO 标签：${preview.seoTags.length > 0 ? preview.seoTags.join(', ') : '后端未返回'}`,
  ].join('\n');
}

function buildListingCsv(listingId: string | null, preview: ListingPreview) {
  const rows = [
    ['id', 'productName', 'platform', 'title', 'suggestedPrice', 'bulletPoints', 'seoTags'],
    [
      listingId ?? '',
      preview.productName ?? '',
      preview.platform ?? '',
      preview.title,
      typeof preview.price === 'number' ? preview.price : '',
      preview.bulletPoints.join('\n'),
      preview.seoTags.join(', '),
    ],
  ];

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function agentOutputText(output: AssistantAgentOutput | null | undefined): string {
  return (
    output?.reply ??
    output?.response ??
    output?.result ??
    output?.summary ??
    ''
  ).trim();
}

function outputLines(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12);
}

interface ListingGeneratorProps {
  initialListingId?: string | null;
}

function ListingGenerator({ initialListingId = null }: ListingGeneratorProps) {
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [activeModule, setActiveModule] = useState<ListingModuleId>('lm1');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false);
  const [candidates, setCandidates] = useState<TitleCandidate[]>([]);
  const [regenerating, setRegenerating] = useState(false);
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [translating, setTranslating] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // ── API-driven state ──
  const [currentListingId, setCurrentListingId] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ListingPreview | null>(null);
  const [historyItems, setHistoryItems] = useState<ListingDraft[]>([]);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [listingProductName, setListingProductName] = useState('');
  const [listingDescription, setListingDescription] = useState('');

  // Per-module chat messages — start empty, populated by user interaction
  const [moduleChats, setModuleChats] = useState<Record<string, { role: 'ai' | 'user'; content: string }[]>>({});

  // Per-module preview panel content — populated from API data
  const [modulePreviewContent, setModulePreviewContent] = useState<Record<string, { title: string; body: string[]; tags?: string[] }>>({});

  const listingModules = useMemo<Array<{ id: ListingModuleId; title: string; icon: string }>>(() => [
    { id: 'lm1', title: t('listingGenerator.moduleTitle'), icon: 'Type' },
    { id: 'lm2', title: t('listingGenerator.moduleBulletPoints'), icon: 'List' },
    { id: 'lm3', title: t('listingGenerator.moduleDescription'), icon: 'FileText' },
    { id: 'lm4', title: t('listingGenerator.moduleSearchTerms'), icon: 'Search' },
    { id: 'lm5', title: t('listingGenerator.moduleAContent'), icon: 'Layout' },
    { id: 'lm6', title: t('listingGenerator.moduleImageSuggestions'), icon: 'Image' },
  ], [t]);

  const steps = useMemo(() => [
    t('listingGenerator.stepProductInfo'),
    t('listingGenerator.stepContentGen'),
    t('listingGenerator.stepPreview'),
    t('listingGenerator.stepMultiPlatform'),
    t('listingGenerator.stepExport'),
  ], [t]);

  const fetchFirstWorkspaceId = useCallback(async () => {
    const res = await api.get<{
      items: WorkspaceSummary[];
      total: number;
    }>('/workspaces', { params: { limit: 1 } });
    const id = res.items?.[0]?.id ?? null;
    setWorkspaceId(id);
    return id;
  }, []);

  // ── Data fetching ──

  const fetchListingData = useCallback(async (listingId: string) => {
    try {
      const [titles, preview, historyRes] = await Promise.all([
        listingsApi.titleCandidates(listingId).catch(() => {
	          addToast(t('listingGenerator.loadFailed'), 'error');
	          return [] as TitleCandidate[];
        }),
        listingsApi.preview(listingId).catch(() => null as ListingPreview | null),
        listingsApi.list({ limit: 50 }).catch(() => ({ items: [] as ListingDraft[], total: 0 })),
      ]);

      setCandidates(titles);
      setPreviewData(preview);
      setHistoryItems(historyRes.items);

      // Populate module preview content from available data
      const mpc: Record<string, { title: string; body: string[]; tags?: string[] }> = {};

      if (preview) {
        mpc['lm1'] = {
          title: preview.title,
          body: preview.bulletPoints.slice(0, 3),
          tags: preview.seoTags,
        };
      }

      // For other modules, fetch the full listing draft to populate content
      try {
        const listing = await listingsApi.getById(listingId);
        if (listing.bulletPoints && listing.bulletPoints.length > 0) {
          mpc['lm2'] = {
            title: t('listingGenerator.bulletPointsVersionA'),
            body: listing.bulletPoints,
          };
        }
        if (listing.description) {
          mpc['lm3'] = {
            title: t('listingGenerator.descriptionDraft'),
            body: listing.description.split('\n').filter(Boolean),
          };
        }
        if (listing.searchTerms && listing.searchTerms.length > 0) {
          mpc['lm4'] = {
            title: t('listingGenerator.searchTermsOptimized'),
            body: listing.searchTerms,
            tags: [t('listingGenerator.tagCore'), t('listingGenerator.tagLongTail'), t('listingGenerator.tagScene'), t('listingGenerator.tagFunction')],
          };
        }
      } catch {
        // Non-critical — modules without data will show empty state
      }

      setModulePreviewContent(mpc);
    } catch {
      addToast(t('listingGenerator.loadFailed'), 'error');
    }
  }, [addToast, t]);

  const loadInitialData = useCallback(async () => {
    setIsInitialLoading(true);
    try {
      const [workspaceRes, listRes] = await Promise.all([
        api.get<{ items: WorkspaceSummary[]; total: number }>('/workspaces', {
          params: { limit: 1 },
        }),
        listingsApi.list({ limit: 50 }),
      ]);
      setWorkspaceId(workspaceRes.items?.[0]?.id ?? null);
      setHistoryItems(listRes.items);

      const initialListing = initialListingId
        ? listRes.items.find((item) => item.id === initialListingId)
        : listRes.items[0];
      if (initialListing) {
        setCurrentListingId(initialListing.id);
        await fetchListingData(initialListing.id);
      } else {
        setCurrentListingId(null);
        setCandidates([]);
        setPreviewData(null);
        setModuleChats({});
        setModulePreviewContent({});
      }
    } catch {
      addToast(t('listingGenerator.loadFailedBackend'), 'error');
    } finally {
      setIsInitialLoading(false);
    }
  }, [addToast, fetchListingData, initialListingId, t]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  // Close "更多操作" dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Handlers ──

  const generateRealListing = async () => {
    const productName = listingProductName.trim();
    if (!productName) {
      addToast('请先输入商品名，不能空跑 Listing 智能体。', 'error');
      return null;
    }

    const resolvedWorkspaceId = workspaceId ?? (await fetchFirstWorkspaceId());
    if (!resolvedWorkspaceId) {
      addToast('没有可用工作区，无法创建真实 Listing 任务。', 'error');
      return null;
    }

    const created = await listingsApi.generate({
      workspaceId: resolvedWorkspaceId,
      productName,
      description: listingDescription.trim() || undefined,
      platform: 'amazon',
      keywords: [],
      tone: 'professional',
    });

    setCurrentListingId(created.id);
    setActiveModule('lm1');
    setCandidates([]);
    setPreviewData(null);
    setModuleChats({});
    setModulePreviewContent({});
    await fetchListingData(created.id);
    return created;
  };

  const handleNewTask = async () => {
    try {
      const created = await generateRealListing();
      if (created) {
        addToast(t('listingGenerator.newTaskCreated'), 'success');
      }
    } catch {
      addToast(t('listingGenerator.newTaskFailed'), 'error');
    }
  };

  const handleRegenerate = async () => {
    if (regenerating || !currentListingId) return;
    setRegenerating(true);
    addToast('正在重新回读后端 Listing 数据...', 'info');
    try {
      await fetchListingData(currentListingId);
      addToast('已重新回读 /listings/:id，没有生成本地假标题。', 'success');
    } catch {
      addToast(t('listingGenerator.regenerateFailed'), 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const handlePolish = async () => {
    if (polishing) return;
    if (!previewData) {
      addToast('没有后端回读的 Listing 内容可润色。', 'error');
      return;
    }
    setPolishing(true);
    try {
      const created = await createAgentRun<AssistantAgentOutput>('CONTENT_WRITER', {
        assistantId: 'listing-polish',
        prompt: [
          '请润色以下 Ozon/跨境电商 Listing 文案。',
          '要求：保留事实，不编造认证、销量、评分、库存、促销；输出可直接给人工审核的版本。',
          buildListingText(previewData),
        ].join('\n\n'),
      });
      const completed =
        created.status === 'COMPLETED'
          ? created
          : await waitForAgentRun<AssistantAgentOutput>(created.id);
      const text = agentOutputText(completed.output);
      if (!text) {
        throw new Error('智能体完成但没有返回润色内容');
      }
      setModulePreviewContent((current) => ({
        ...current,
        [activeModule]: {
          title: '智能体润色结果',
          body: outputLines(text),
        },
      }));
      setModuleChats((current) => ({
        ...current,
        [activeModule]: [
          ...(current[activeModule] ?? []),
          { role: 'user', content: '润色当前后端 Listing' },
          { role: 'ai', content: `已通过真实智能体润色。（runId: ${completed.id}）` },
        ],
      }));
      addToast('Listing 已通过真实智能体润色，结果进入当前模块预览。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? `润色失败：${error.message}` : '润色失败，未生成假结果。', 'error');
    } finally {
      setPolishing(false);
    }
  };

  const handleTranslate = async () => {
    if (translating) return;
    if (!previewData) {
      addToast('没有后端回读的 Listing 内容可翻译。', 'error');
      return;
    }
    setTranslating(true);
    try {
      const created = await createAgentRun<AssistantAgentOutput>('CONTENT_WRITER', {
        assistantId: 'listing-translate-ru',
        prompt: [
          '请把以下 Listing 文案翻译成俄语，适配 Ozon 商品页。',
          '要求：保留事实，不新增功效、认证、库存、评分或销量；输出标题、五点、描述和搜索词。',
          buildListingText(previewData),
        ].join('\n\n'),
      });
      const completed =
        created.status === 'COMPLETED'
          ? created
          : await waitForAgentRun<AssistantAgentOutput>(created.id);
      const text = agentOutputText(completed.output);
      if (!text) {
        throw new Error('智能体完成但没有返回翻译内容');
      }
      setModulePreviewContent((current) => ({
        ...current,
        [activeModule]: {
          title: '俄语翻译结果',
          body: outputLines(text),
        },
      }));
      setModuleChats((current) => ({
        ...current,
        [activeModule]: [
          ...(current[activeModule] ?? []),
          { role: 'user', content: '翻译当前 Listing 为俄语' },
          { role: 'ai', content: `已通过真实智能体翻译。（runId: ${completed.id}）` },
        ],
      }));
      addToast('Listing 已通过真实智能体翻译，结果进入当前模块预览。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? `翻译失败：${error.message}` : '翻译失败，未生成假结果。', 'error');
    } finally {
      setTranslating(false);
    }
  };

  const handleMoreAction = (action: string) => {
    setMoreDropdownOpen(false);
    if (action === 'copy') {
      if (!previewData) {
        addToast('没有后端回读的 Listing 内容可复制。', 'error');
        return;
      }

      void navigator.clipboard.writeText(buildListingText(previewData))
        .then(() => addToast('已复制当前后端回读的 Listing 内容。', 'success'))
        .catch(() => addToast('复制失败，浏览器未授权剪贴板。', 'error'));
      return;
    }

    if (action === 'share') {
      addToast('分享链接接口未接入真实后端，已拒绝假成功。', 'error');
      return;
    }

    if (action === 'feedback') {
      addToast('反馈提交接口未接入真实后端，已拒绝假成功。', 'error');
      return;
    }

    addToast('未知操作，未执行。', 'error');
  };

  const handleSaveDraft = () => {
    addToast('当前页面没有真实编辑表单，不能把原始回读内容 PATCH 后假装保存成功。', 'error');
  };

  const handleGenerateAll = async () => {
    if (isGeneratingAll) return;
    setIsGeneratingAll(true);
    addToast('正在调用真实 /listings/generate 创建 Listing...', 'info');
    try {
      const created = await generateRealListing();
      if (created) {
        addToast('已通过真实 /listings/generate 创建 Listing；A+、图片建议、多平台派生未接入，不声明全部通过。', 'success');
      }
    } catch {
      addToast(t('listingGenerator.newTaskFailed'), 'error');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleExportCSV = () => {
    if (!previewData) {
      addToast('没有后端回读的 Listing 内容可导出。', 'error');
      return;
    }

    const blob = new Blob([buildListingCsv(currentListingId, previewData)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `listing-${currentListingId ?? 'draft'}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    addToast('已从当前后端回读内容生成 CSV 文件。', 'success');
  };

  const handleLoadHistory = async (item: ListingDraft) => {
    setHistoryModalOpen(false);
    setCurrentListingId(item.id);
    addToast(t('listingGenerator.loadSuccess', { title: item.title || t('listingGenerator.unnamedListing') }), 'info');
    setActiveModule('lm1');
    setCandidates([]);
    setModuleChats({});
    setModulePreviewContent({});
    await fetchListingData(item.id);
  };

  // ── Derived data ──
  const currentChat = moduleChats[activeModule] ?? [];
  const currentPreview = modulePreviewContent[activeModule] ?? { title: '', body: [] };
  const showTitleCandidates = activeModule === 'lm1';
  const hasPreviewTitle = Boolean(previewData?.title);
  const hasBullets = (previewData?.bulletPoints.length ?? 0) > 0;
  const hasSeoTags = (previewData?.seoTags.length ?? 0) > 0;
  const hasDescription = (modulePreviewContent.lm3?.body.length ?? 0) > 0;
  const hasImages = (previewData?.images.length ?? 0) > 0;

  const getModuleStatus = (moduleId: ListingModuleId) => {
    if (!currentListingId) return '无后端样本';
    if (moduleId === 'lm1') return hasPreviewTitle ? '真实回读' : '后端未返回';
    if (moduleId === 'lm2') return hasBullets ? `真实回读 ${previewData?.bulletPoints.length ?? 0} 条` : '后端未返回';
    if (moduleId === 'lm3') return hasDescription ? '真实回读' : '后端未返回';
    if (moduleId === 'lm4') return hasSeoTags ? `真实回读 ${previewData?.seoTags.length ?? 0} 个` : '后端未返回';
    return '未接入';
  };

  const emptyModuleMessage = (() => {
    if (!currentListingId) return '暂无真实 Listing 样本。请输入商品名并调用 /listings/generate。';
    if (activeModule === 'lm5') return 'A+ Content 后端合同未接入，页面不展示本地模拟内容。';
    if (activeModule === 'lm6') return '图片建议后端合同未接入，页面不展示本地模拟图片方案。';
    return '当前模块没有后端回读内容，未展示本地假结果。';
  })();

  if (isInitialLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 rounded-full border-3 border-[#6C63FF] border-t-transparent animate-spin" />
        <span className="ml-3 text-sm text-[#6B7280]">{t('listingGenerator.generating')}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#1A1A2E]">{t('listingGenerator.title')}</h2>
          <p className="text-sm text-[#6B7280] mt-1">{t('listingGenerator.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="load-history-btn"
            onClick={() => setHistoryModalOpen(true)}
            className="rounded-lg border border-[#E8E8F0] px-3.5 py-2 text-sm text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
          >
            <Clock size={15} className="inline mr-1.5 -mt-0.5" />
            {t('listingGenerator.loadHistory')}
          </button>
          <button
            data-testid="new-task-btn"
            onClick={() => void handleNewTask()}
            className="rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] px-3.5 py-2 text-sm text-white transition-opacity hover:opacity-90"
          >
            {t('listingGenerator.newTask')}
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm lg:grid-cols-[1fr_1.4fr_auto]">
        <input
          data-testid="listing-product-name"
          value={listingProductName}
          onChange={(event) => setListingProductName(event.target.value)}
          placeholder="输入商品名，例如 Portable Neck Fan"
          className="h-10 rounded-lg border border-[#DDE1F2] bg-[#F8F9FF] px-3 text-sm text-[#1A1A2E] outline-none focus:border-[#6C63FF]"
        />
        <input
          data-testid="listing-description"
          value={listingDescription}
          onChange={(event) => setListingDescription(event.target.value)}
          placeholder="补充卖点、材质、场景或关键词"
          className="h-10 rounded-lg border border-[#DDE1F2] bg-[#F8F9FF] px-3 text-sm text-[#1A1A2E] outline-none focus:border-[#6C63FF]"
        />
        <button
          type="button"
          data-testid="generate-real-listing"
          onClick={() => void handleNewTask()}
          disabled={isGeneratingAll}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#6C63FF] px-4 text-sm font-semibold text-white hover:bg-[#5B54E8] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Sparkles size={16} />
          真实生成 Listing
        </button>
      </div>

      {/* Steps */}
      <div className="flex items-center justify-between rounded-xl border border-[#E8E8F0] bg-white px-6 py-4 shadow-sm">
        {steps.map((step, idx) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
              idx <= 1 ? 'bg-[#6C63FF] text-white' : 'bg-[#F0F0F8] text-[#8B93B5]'
            }`}>
              {idx < 1 ? <CheckCircle size={14} /> : idx + 1}
            </div>
            <span className={`text-xs font-medium ${idx <= 1 ? 'text-[#1A1A2E]' : 'text-[#8B93B5]'}`}>{step}</span>
            {idx < steps.length - 1 && <ChevronRight size={14} className="text-[#D1D5DB] mx-1" />}
          </div>
        ))}
      </div>

      {/* Main 3-column layout */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left: Module Menu */}
        <div className="col-span-2 space-y-1" data-testid="module-menu">
          {listingModules.map((mod) => {
            const IconComponent =
              mod.id === 'lm1' ? FileText :
              mod.id === 'lm2' ? List :
              mod.id === 'lm3' ? FileText :
              mod.id === 'lm4' ? Tags :
              mod.id === 'lm5' ? Star :
              Globe;
            return (
              <button
                key={mod.id}
                data-testid={`module-btn-${mod.id}`}
                onClick={() => {
                  setActiveModule(mod.id);
                  setMoreDropdownOpen(false);
                }}
                className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  activeModule === mod.id
                    ? 'bg-[#F0EEFF] text-[#6C63FF] font-medium'
                    : 'text-[#4A5578] hover:bg-[#F8F9FF]'
                }`}
              >
                <IconComponent size={16} />
                <div className="text-left">
                  <p className="text-xs">{mod.title}</p>
                  <p className="text-[10px] text-[#8B93B5]">
                    {getModuleStatus(mod.id)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Middle: Chat Area */}
        <div className="col-span-6 rounded-xl border border-[#E8E8F0] bg-white shadow-sm flex flex-col" data-testid="chat-area">
          {/* Messages */}
          <div className="flex-1 space-y-4 p-5 overflow-y-auto max-h-[400px]">
            {currentChat.length === 0 && !showTitleCandidates && currentPreview.body.length === 0 && (
              <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-[#DDE1F2] bg-[#F8F9FF] px-4 text-center text-sm text-[#8B93B5]">
                {emptyModuleMessage}
              </div>
            )}
            {currentChat.map((msg, idx) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'ai' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6C63FF] text-white">
                    <Bot size={16} />
                  </div>
                )}
                <div className={`rounded-xl px-4 py-3 max-w-[85%] ${
                  msg.role === 'ai' ? 'bg-[#F8F9FF]' : 'bg-[#6C63FF]'
                }`}>
                  <p className={`text-sm leading-relaxed ${
                    msg.role === 'ai' ? 'text-[#1A1A2E]' : 'text-white'
                  }`}>
                    {msg.content}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8E8F0] text-[#6B7280]">
                    <User size={16} />
                  </div>
                )}
              </div>
            ))}

            {/* Module-specific content after the last AI message */}

            {/* Title candidates for lm1 */}
            {showTitleCandidates && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6C63FF] text-white">
                  <Bot size={16} />
                </div>
                <div className="flex-1">
                  {candidates.length === 0 ? (
                    <div className="rounded-xl border border-[#E8E8F0] bg-[#F8F9FF] p-4 text-center text-sm text-[#8B93B5]">
                      {t('listingGenerator.noCandidates')}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {candidates.map((tc, idx) => (
                        <div
                          key={tc.id}
                          data-testid={`candidate-${tc.id}`}
                          className={`rounded-xl border p-3 cursor-pointer transition-colors ${
                            idx === 0 ? 'border-[#6C63FF] bg-[#F0EEFF]' : 'border-[#E8E8F0] hover:border-[#6C63FF]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm text-[#1A1A2E] flex-1">{tc.title}</p>
                            {typeof tc.score === 'number' ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <Sparkles size={12} className="text-[#FFB020]" />
                                <span className="text-xs font-bold text-[#6C63FF]">{tc.score}/100</span>
                              </div>
                            ) : (
                              <span className="shrink-0 rounded-full bg-[#F8F9FF] px-2 py-0.5 text-[10px] text-[#8B93B5]">
                                后端未返回评分
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {tc.features.map((f) => (
                              <span key={f} className="text-[10px] text-[#6C63FF] bg-[#F0EEFF] px-1.5 py-0.5 rounded">{f}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Generically-rendered module content for non-title modules */}
            {!showTitleCandidates && currentPreview.body.length > 0 && (
              <div className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#6C63FF] text-white">
                  <Bot size={16} />
                </div>
                <div className="flex-1">
                  <div className="space-y-2">
                    {currentPreview.body.map((item, i) => (
                      <div key={i} className="rounded-xl border border-[#E8E8F0] bg-[#F8F9FF] p-3">
                        <p className="text-sm text-[#1A1A2E]">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 border-t border-[#E8E8F0] px-5 py-3">
            <button
              data-testid="regenerate-btn"
              onClick={() => void handleRegenerate()}
              disabled={regenerating}
              className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={regenerating ? 'animate-spin' : ''} /> {t('listingGenerator.regenerate')}
            </button>
            <button
              data-testid="polish-btn"
              onClick={handlePolish}
              disabled={polishing || !previewData}
              className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Edit3 size={14} /> {polishing ? '润色中' : t('listingGenerator.polish')}
            </button>
            <button
              data-testid="translate-btn"
              onClick={handleTranslate}
              disabled={translating || !previewData}
              className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Languages size={14} /> {translating ? '翻译中' : t('listingGenerator.translate')}
            </button>
            <div className="relative" ref={moreRef}>
              <button
                data-testid="more-actions-btn"
                onClick={() => setMoreDropdownOpen((v) => !v)}
                className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
              >
                <MoreHorizontal size={14} /> {t('listingGenerator.moreActions')}
              </button>
              {moreDropdownOpen && (
                <div
                  data-testid="more-actions-dropdown"
                  className="absolute bottom-full left-0 mb-1.5 w-40 rounded-lg border border-[#E8E8F0] bg-white shadow-lg z-10 overflow-hidden"
                >
                  <button
                    data-testid="action-copy"
                    onClick={() => handleMoreAction('copy')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#4A5578] hover:bg-[#F8F9FF] transition-colors"
                  >
                    <Copy size={14} /> {t('listingGenerator.copyFull')}
                  </button>
                  <button
                    data-testid="action-share"
                    onClick={() => handleMoreAction('share')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#4A5578] hover:bg-[#F8F9FF] transition-colors"
                  >
                    <Share2 size={14} /> {t('listingGenerator.shareLink')}
                  </button>
                  <button
                    data-testid="action-feedback"
                    onClick={() => handleMoreAction('feedback')}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-[#4A5578] hover:bg-[#F8F9FF] transition-colors"
                  >
                    <MessageSquare size={14} /> {t('listingGenerator.feedback')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="col-span-4" data-testid="preview-panel">
          <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E8F0] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('listingGenerator.previewPanel')}</h3>
              <span className="rounded-lg border border-[#E8E8F0] bg-white px-2 py-1 text-xs text-[#4A5578]" data-testid="platform-select">
                {previewData?.platform || '平台后端未返回'}
              </span>
            </div>
            <div className="p-4">
              {/* Product image */}
              <div className="mb-3 flex h-32 items-center justify-center rounded-xl border border-dashed border-[#DDE1F2] bg-[#F8F9FF]">
                {hasImages && previewData?.images[0] ? (
                  <img
                    src={previewData.images[0]}
                    alt={previewData.productName || previewData.title || 'Listing image'}
                    className="h-full w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="px-4 text-center">
                    <p className="text-xs font-semibold text-[#4A5578]">图片后端未返回</p>
                    <p className="mt-1 text-[10px] leading-4 text-[#8B93B5]">未展示本地样例图或占位商品图。</p>
                  </div>
                )}
              </div>

              {/* Product info */}
              <div className="space-y-2 mb-3">
                <p className="text-sm font-medium text-[#1A1A2E] leading-tight" data-testid="preview-title">
                  {currentPreview.title || '标题后端未返回'}
                </p>
                {activeModule === 'lm1' && (
                  <>
                    {typeof previewData?.rating === 'number' || typeof previewData?.reviewCount === 'number' ? (
                      <div className="flex items-center gap-2">
                        {typeof previewData.rating === 'number' && (
                          <span className="text-xs text-[#4A5578]">评分 {previewData.rating}</span>
                        )}
                        {typeof previewData.reviewCount === 'number' && (
                          <span className="text-xs text-[#6B7280]">评论 {previewData.reviewCount}</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#8B93B5]">评分/评论数后端未返回，未补默认值。</p>
                    )}
                    {typeof previewData?.price === 'number' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[#1A1A2E]">${previewData.price}</span>
                        <span className="text-xs text-[#8B93B5]">来自 attributes.suggestedPrice</span>
                      </div>
                    ) : (
                      <p className="text-xs text-[#8B93B5]">建议价格后端未返回。</p>
                    )}
                    <p className="text-xs text-[#8B93B5]">Prime、库存状态没有后端合同，未展示假标签。</p>
                  </>
                )}
              </div>

              {/* Module-specific preview body */}
              {activeModule === 'lm1' ? (
                <>
                  <div className="space-y-1.5 mb-3">
                    <p className="text-xs font-semibold text-[#1A1A2E]">{t('listingGenerator.productFeatures')}</p>
                    {hasBullets ? (
                      (previewData?.bulletPoints ?? []).slice(0, 3).map((bp, idx) => (
                        <p key={idx} className="text-xs text-[#4A5578] leading-relaxed">{bp}</p>
                      ))
                    ) : (
                      <p className="text-xs text-[#8B93B5]">后端未返回五点描述。</p>
                    )}
                  </div>
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-[#1A1A2E] mb-1">{t('listingGenerator.seoTags')}</p>
                    <div className="flex flex-wrap gap-1">
                      {hasSeoTags ? (
                        (previewData?.seoTags ?? []).map((tag) => (
                          <span key={tag} className="text-[10px] bg-[#F0EEFF] text-[#6C63FF] px-2 py-0.5 rounded-full">{tag}</span>
                        ))
                      ) : (
                        <span className="text-xs text-[#8B93B5]">后端未返回 SEO 标签。</span>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5 mb-3">
                    <p className="text-xs font-semibold text-[#1A1A2E]">
                      {activeModule === 'lm2' ? t('listingGenerator.moduleBulletPoints') :
                       activeModule === 'lm3' ? t('listingGenerator.moduleDescription') :
                       activeModule === 'lm4' ? t('listingGenerator.moduleSearchTerms') :
                       activeModule === 'lm5' ? t('listingGenerator.moduleAContent') :
                       t('listingGenerator.moduleImageSuggestions')}
                    </p>
                    {currentPreview.body.length > 0 ? (
                      currentPreview.body.map((item, idx) => (
                        <p key={idx} className="text-xs text-[#4A5578] leading-relaxed">{item}</p>
                      ))
                    ) : (
                      <p className="text-xs text-[#8B93B5]">{emptyModuleMessage}</p>
                    )}
                  </div>
                  {currentPreview.tags && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-[#1A1A2E] mb-1">{t('listingGenerator.tagCategory')}</p>
                      <div className="flex flex-wrap gap-1">
                        {currentPreview.tags.map((tag) => (
                          <span key={tag} className="text-[10px] bg-[#F0EEFF] text-[#6C63FF] px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Multi-platform */}
              <div>
                <p className="text-xs font-semibold text-[#1A1A2E] mb-1">{t('listingGenerator.multiPlatform')}</p>
                <div className="flex gap-1.5">
                  {previewData?.platform ? (
                    <span className="text-[9px] bg-[#F8F9FF] border border-[#E8E8F0] px-1.5 py-0.5 rounded">{previewData.platform}</span>
                  ) : (
                    <span className="text-xs text-[#8B93B5]">平台后端未返回。</span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-[#8B93B5]">多平台派生适配接口未接入，未展示 Amazon CA/Walmart/eBay/TikTok 假结果。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-end gap-3 rounded-xl border border-[#E8E8F0] bg-white px-5 py-3 shadow-sm" data-testid="bottom-actions">
        <button
          data-testid="save-draft-btn"
          onClick={() => void handleSaveDraft()}
          className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3.5 py-2 text-sm text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
        >
          <Save size={15} /> {t('listingGenerator.saveDraft')}
        </button>
        <button
          data-testid="generate-all-btn"
          onClick={handleGenerateAll}
          disabled={isGeneratingAll}
          className="rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] px-3.5 py-2 text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isGeneratingAll ? t('listingGenerator.generating') : '创建真实 Listing'}
        </button>
        <button
          data-testid="export-csv-btn"
          onClick={handleExportCSV}
          className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3.5 py-2 text-sm text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors"
        >
          <Download size={15} /> {t('listingGenerator.exportCSV')}
        </button>
      </div>

      {/* History Modal */}
      <Modal open={historyModalOpen} onClose={() => setHistoryModalOpen(false)} title={t('listingGenerator.historyTitle')}>
        <div className="space-y-2" data-testid="history-modal">
          {historyItems.length === 0 ? (
            <p className="text-sm text-[#8B93B5] text-center py-4">{t('listingGenerator.noHistory')}</p>
          ) : (
            historyItems.map((item) => (
              <div
                key={item.id}
                data-testid={`history-item-${item.id}`}
                className="flex items-center justify-between rounded-lg border border-[#E8E8F0] p-3 hover:border-[#6C63FF] cursor-pointer transition-colors"
                onClick={() => void handleLoadHistory(item)}
              >
                <div>
                  <p className="text-sm font-medium text-[#1A1A2E]">{item.title || t('listingGenerator.unnamedListing')}</p>
                  <p className="text-xs text-[#8B93B5] mt-0.5">{t('listingGenerator.historyItemTitle', { date: item.updatedAt })}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  item.status === 'completed' || item.status === 'published' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#FFB020]/10 text-[#FFB020]'
                }`}>
                  {item.status === 'completed' || item.status === 'published' ? t('listingGenerator.statusCompleted') : t('listingGenerator.statusDraft')}
                </span>
              </div>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}

export default ListingGenerator;
