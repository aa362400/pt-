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
    `title：${preview.title || 'backendenglish_text'}`,
    `product：${preview.productName || 'backendenglish_text'}`,
    `platform：${preview.platform || 'backendenglish_text'}`,
    `english_text：${typeof preview.price === 'number' ? `$${preview.price}` : 'backendenglish_text'}`,
    '',
    'english_text：',
    ...(preview.bulletPoints.length > 0 ? preview.bulletPoints.map((item) => `- ${item}`) : ['backendenglish_text']),
    '',
    `SEO text：${preview.seoTags.length > 0 ? preview.seoTags.join(', ') : 'backendenglish_text'}`,
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

  // Close "english_text" dropdown on outside click
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
      addToast('textinputproducttext，english_text Listing agent。', 'error');
      return null;
    }

    const resolvedWorkspaceId = workspaceId ?? (await fetchFirstWorkspaceId());
    if (!resolvedWorkspaceId) {
      addToast('textyesenglish_text，noneenglish_textreal Listing task。', 'error');
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
    addToast('english_textbackend Listing data...', 'info');
    try {
      await fetchListingData(currentListingId);
      addToast('english_text /listings/:id，textyestextcosttexttitle。', 'success');
    } catch {
      addToast(t('listingGenerator.regenerateFailed'), 'error');
    } finally {
      setRegenerating(false);
    }
  };

  const handlePolish = async () => {
    if (polishing) return;
    if (!previewData) {
      addToast('textyesbackendenglish_text Listing english_text。', 'error');
      return;
    }
    setPolishing(true);
    try {
      const created = await createAgentRun<AssistantAgentOutput>('CONTENT_WRITER', {
        assistantId: 'listing-polish',
        prompt: [
          'english_text Ozon/cross-border e-commerce Listing text。',
          'text：english_text，english_text、text、text、text、text；outputenglish_texthumanreviewenglish_text。',
          buildListingText(previewData),
        ].join('\n\n'),
      });
      const completed =
        created.status === 'COMPLETED'
          ? created
          : await waitForAgentRun<AssistantAgentOutput>(created.id);
      const text = agentOutputText(completed.output);
      if (!text) {
        throw new Error('agentcompletedtextyesenglish_text');
      }
      setModulePreviewContent((current) => ({
        ...current,
        [activeModule]: {
          title: 'agentenglish_text',
          body: outputLines(text),
        },
      }));
      setModuleChats((current) => ({
        ...current,
        [activeModule]: [
          ...(current[activeModule] ?? []),
          { role: 'user', content: 'english_textbackend Listing' },
          { role: 'ai', content: `textpassedrealagenttext。（runId: ${completed.id}）` },
        ],
      }));
      addToast('Listing textpassedrealagenttext，english_text。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? `textfailed：${error.message}` : 'textfailed，textgenerationenglish_text。', 'error');
    } finally {
      setPolishing(false);
    }
  };

  const handleTranslate = async () => {
    if (translating) return;
    if (!previewData) {
      addToast('textyesbackendenglish_text Listing english_text。', 'error');
      return;
    }
    setTranslating(true);
    try {
      const created = await createAgentRun<AssistantAgentOutput>('CONTENT_WRITER', {
        assistantId: 'listing-translate-ru',
        prompt: [
          'english_text Listing english_text，text Ozon producttext。',
          'text：english_text，english_text、text、text、english_text；outputtitle、text、english_textsearchtext。',
          buildListingText(previewData),
        ].join('\n\n'),
      });
      const completed =
        created.status === 'COMPLETED'
          ? created
          : await waitForAgentRun<AssistantAgentOutput>(created.id);
      const text = agentOutputText(completed.output);
      if (!text) {
        throw new Error('agentcompletedtextyesenglish_text');
      }
      setModulePreviewContent((current) => ({
        ...current,
        [activeModule]: {
          title: 'english_text',
          body: outputLines(text),
        },
      }));
      setModuleChats((current) => ({
        ...current,
        [activeModule]: [
          ...(current[activeModule] ?? []),
          { role: 'user', content: 'english_text Listing english_text' },
          { role: 'ai', content: `textpassedrealagenttext。（runId: ${completed.id}）` },
        ],
      }));
      addToast('Listing textpassedrealagenttext，english_text。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? `textfailed：${error.message}` : 'textfailed，textgenerationenglish_text。', 'error');
    } finally {
      setTranslating(false);
    }
  };

  const handleMoreAction = (action: string) => {
    setMoreDropdownOpen(false);
    if (action === 'copy') {
      if (!previewData) {
        addToast('textyesbackendenglish_text Listing english_text。', 'error');
        return;
      }

      void navigator.clipboard.writeText(buildListingText(previewData))
        .then(() => addToast('english_textbackendenglish_text Listing text。', 'success'))
        .catch(() => addToast('textfailed，english_text。', 'error'));
      return;
    }

    if (action === 'share') {
      addToast('english_textAPIenglish_textrealbackend，english_textsuccess。', 'error');
      return;
    }

    if (action === 'feedback') {
      addToast('english_textAPIenglish_textrealbackend，english_textsuccess。', 'error');
      return;
    }

    addToast('english_text，english_text。', 'error');
  };

  const handleSaveDraft = () => {
    addToast('english_textyesrealenglish_text，english_text PATCH english_textsuccess。', 'error');
  };

  const handleGenerateAll = async () => {
    if (isGeneratingAll) return;
    setIsGeneratingAll(true);
    addToast('english_textreal /listings/generate text Listing...', 'info');
    try {
      const created = await generateRealListing();
      if (created) {
        addToast('textpassedreal /listings/generate text Listing；A+、imagetext、textplatformenglish_text，english_textallpassed。', 'success');
      }
    } catch {
      addToast(t('listingGenerator.newTaskFailed'), 'error');
    } finally {
      setIsGeneratingAll(false);
    }
  };

  const handleExportCSV = () => {
    if (!previewData) {
      addToast('textyesbackendenglish_text Listing english_text。', 'error');
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
    addToast('english_textbackendenglish_textgeneration CSV file。', 'success');
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
    if (!currentListingId) return 'nonebackendtext';
    if (moduleId === 'lm1') return hasPreviewTitle ? 'realtext' : 'backendenglish_text';
    if (moduleId === 'lm2') return hasBullets ? `realtext ${previewData?.bulletPoints.length ?? 0} text` : 'backendenglish_text';
    if (moduleId === 'lm3') return hasDescription ? 'realtext' : 'backendenglish_text';
    if (moduleId === 'lm4') return hasSeoTags ? `realtext ${previewData?.seoTags.length ?? 0} text` : 'backendenglish_text';
    return 'english_text';
  };

  const emptyModuleMessage = (() => {
    if (!currentListingId) return 'textnonereal Listing text。textinputproductenglish_text /listings/generate。';
    if (activeModule === 'lm5') return 'A+ Content backendenglish_text，english_textlocalenglish_text。';
    if (activeModule === 'lm6') return 'imagetextbackendenglish_text，english_textlocaltextimageplan。';
    return 'english_textyesbackendenglish_text，english_textlocalenglish_text。';
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
          placeholder="inputproducttext，text Portable Neck Fan"
          className="h-10 rounded-lg border border-[#DDE1F2] bg-[#F8F9FF] px-3 text-sm text-[#1A1A2E] outline-none focus:border-[#6C63FF]"
        />
        <input
          data-testid="listing-description"
          value={listingDescription}
          onChange={(event) => setListingDescription(event.target.value)}
          placeholder="english_text、text、scenetextkeywords"
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
          realgeneration Listing
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
                                backendenglish_text
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
              <Edit3 size={14} /> {polishing ? 'english_text' : t('listingGenerator.polish')}
            </button>
            <button
              data-testid="translate-btn"
              onClick={handleTranslate}
              disabled={translating || !previewData}
              className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Languages size={14} /> {translating ? 'english_text' : t('listingGenerator.translate')}
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
                {previewData?.platform || 'platformbackendenglish_text'}
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
                    <p className="text-xs font-semibold text-[#4A5578]">imagebackendenglish_text</p>
                    <p className="mt-1 text-[10px] leading-4 text-[#8B93B5]">english_textlocalenglish_textproducttext。</p>
                  </div>
                )}
              </div>

              {/* Product info */}
              <div className="space-y-2 mb-3">
                <p className="text-sm font-medium text-[#1A1A2E] leading-tight" data-testid="preview-title">
                  {currentPreview.title || 'titlebackendenglish_text'}
                </p>
                {activeModule === 'lm1' && (
                  <>
                    {typeof previewData?.rating === 'number' || typeof previewData?.reviewCount === 'number' ? (
                      <div className="flex items-center gap-2">
                        {typeof previewData.rating === 'number' && (
                          <span className="text-xs text-[#4A5578]">text {previewData.rating}</span>
                        )}
                        {typeof previewData.reviewCount === 'number' && (
                          <span className="text-xs text-[#6B7280]">text {previewData.reviewCount}</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[#8B93B5]">text/english_textbackendenglish_text，english_text。</p>
                    )}
                    {typeof previewData?.price === 'number' ? (
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[#1A1A2E]">${previewData.price}</span>
                        <span className="text-xs text-[#8B93B5]">text attributes.suggestedPrice</span>
                      </div>
                    ) : (
                      <p className="text-xs text-[#8B93B5]">english_textbackendenglish_text。</p>
                    )}
                    <p className="text-xs text-[#8B93B5]">Prime、textstatustextyesbackendtext，english_text。</p>
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
                      <p className="text-xs text-[#8B93B5]">backendenglish_text。</p>
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
                        <span className="text-xs text-[#8B93B5]">backendenglish_text SEO text。</span>
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
                    <span className="text-xs text-[#8B93B5]">platformbackendenglish_text。</span>
                  )}
                </div>
                <p className="mt-1 text-[10px] text-[#8B93B5]">textplatformenglish_textAPIenglish_text，english_text Amazon CA/Walmart/eBay/TikTok english_text。</p>
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
          {isGeneratingAll ? t('listingGenerator.generating') : 'textreal Listing'}
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
