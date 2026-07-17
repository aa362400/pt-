import { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Bot,
  Clock,
  ExternalLink,
  Filter,
  Flag,
  Image as ImageIcon,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Search,
  Send,
  Sparkles,
  User,
} from 'lucide-react';
import {
  filterCustomerConversations,
  type CustomerConversationFilter,
} from '../utils/customer-service-presentation';

export interface CustomerConversation {
  id: string;
  customer: string;
  platform: string;
  subject: string;
  lastMessage: string;
  time: string;
  unread: number;
  status: 'pending' | 'resolved';
  aiHandled: boolean;
  priority: 'high' | 'low';
  orderId: string | null;
  messages: Array<{
    id: string;
    sender: 'customer' | 'ai' | 'agent';
    content: string;
    time: string;
  }>;
}

export interface CustomerServiceStat {
  label: string;
  value: string;
  icon: typeof MessageCircle;
  color: string;
}

interface CustomerServiceProps {
  conversations: CustomerConversation[];
  stats: CustomerServiceStat[];
  loading?: boolean;
  onSelectConversation?: (conversation: CustomerConversation) => void;
  onRequestReply?: (conversation: CustomerConversation, text: string) => Promise<void>;
  submittingReply?: boolean;
  actionMessage?: string | null;
}

function PlatformIcon({ platform }: { platform: string }) {
  return (
    <div className="flex h-6 w-6 items-center justify-center rounded bg-sky-600 text-xs font-bold text-white">
      {platform.slice(0, 1).toUpperCase() || '?'}
    </div>
  );
}

export function CustomerService({ conversations, stats, loading = false, onSelectConversation, onRequestReply, submittingReply = false, actionMessage }: CustomerServiceProps) {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(conversations[0]?.id ?? null);
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversationFilter, setConversationFilter] =
    useState<CustomerConversationFilter>('all');
  const visibleConversations = useMemo(
    () =>
      filterCustomerConversations(
        conversations,
        searchQuery,
        conversationFilter,
      ),
    [conversationFilter, conversations, searchQuery],
  );
  const selected = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversation) ?? conversations[0] ?? null,
    [conversations, selectedConversation],
  );

  useEffect(() => {
    if (!selectedConversation && conversations[0]) {
      setSelectedConversation(conversations[0].id);
      onSelectConversation?.(conversations[0]);
    }
  }, [conversations, onSelectConversation, selectedConversation]);

  const selectConversation = (conversation: CustomerConversation) => {
    setSelectedConversation(conversation.id);
    setDraft('');
    onSelectConversation?.(conversation);
  };

  const submitReply = async () => {
    if (!selected || !onRequestReply || !draft.trim()) return;
    await onRequestReply(selected, draft.trim());
    setDraft('');
  };

  return (
    <div className="h-full p-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">客户服务</h1>
        <p className="mt-1 text-gray-500">AI 智能客服，自动回复常见问题，人工处理复杂咨询</p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="mb-1 text-3xl font-bold text-gray-900">{stat.value}</div>
                <div className="text-sm text-gray-500">{stat.label}</div>
              </div>
              <div className={`flex h-12 w-12 items-center justify-center rounded-lg bg-gray-50 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-8 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-purple-50 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-blue-600 to-purple-600">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="mb-2 font-bold text-gray-900">AI 客服工作摘要</h2>
            <p className="text-sm text-gray-700">
              {conversations.length > 0
                ? `当前已同步 ${conversations.length} 条真实会话；发送和状态修改仍需在业务操作页确认。`
                : '尚未接入可读取的 Ozon 客户消息接口，不展示 Figma 演示会话。'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-h-[520px] grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="flex flex-col rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索客户、消息或订单..."
                aria-label="搜索客户、消息或订单"
                className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setConversationFilter('all')}
                aria-pressed={conversationFilter === 'all'}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm ${conversationFilter === 'all' ? 'bg-blue-600 font-medium text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                全部 ({conversations.length})
              </button>
              <button
                onClick={() => setConversationFilter('pending')}
                aria-pressed={conversationFilter === 'pending'}
                className={`flex-1 rounded-lg px-3 py-1.5 text-sm ${conversationFilter === 'pending' ? 'bg-blue-600 font-medium text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                待处理 ({conversations.filter((item) => item.status === 'pending').length})
              </button>
              <button aria-label="高级筛选" title="高级筛选尚未接入" disabled className="cursor-not-allowed rounded-lg border border-gray-200 p-1.5 text-gray-300"><Filter className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-8 text-center text-sm text-gray-500">正在读取真实会话...</div>}
            {!loading && conversations.length === 0 && <div className="p-8 text-center text-sm text-gray-500">暂无真实会话数据</div>}
            {!loading && conversations.length > 0 && visibleConversations.length === 0 && <div className="p-8 text-center text-sm text-gray-500">没有符合当前搜索或筛选条件的会话</div>}
            {visibleConversations.map((conversation) => (
              <button key={conversation.id} onClick={() => selectConversation(conversation)} className={`w-full border-b border-gray-100 p-4 text-left transition-colors ${selected?.id === conversation.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <div className="flex items-start gap-3">
                  <PlatformIcon platform={conversation.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-gray-900">{conversation.customer}</span><span className="shrink-0 text-xs text-gray-500">{conversation.time}</span></div>
                    <p className="mb-2 truncate text-sm text-gray-600">{conversation.subject}</p>
                    <div className="flex items-center gap-2">
                      {conversation.aiHandled && <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"><Bot className="h-3 w-3" />AI 已处理</span>}
                      {conversation.unread > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-medium text-white">{conversation.unread}</span>}
                      {conversation.priority === 'high' && <Flag className="h-3 w-3 text-red-500" />}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col rounded-xl border border-gray-100 bg-white shadow-sm xl:col-span-2">
          {selected ? (
            <>
              <div className="flex items-center justify-between border-b border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 font-medium text-white">{selected.customer.slice(0, 2).toUpperCase()}</div>
                  <div><h3 className="font-bold text-gray-900">{selected.customer}</h3><div className="mt-1 flex items-center gap-2"><PlatformIcon platform={selected.platform} /><span className="text-xs text-gray-500">{selected.orderId ? `订单 #${selected.orderId}` : '无关联订单'}</span><span className="inline-flex items-center gap-1 rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-700"><Clock className="h-3 w-3" />{selected.status === 'pending' ? '待处理' : '已解决'}</span></div></div>
                </div>
                <div className="flex gap-2">
                  <button aria-label="独立操作页不可用" title="独立操作页尚未接入后端" disabled className="cursor-not-allowed rounded-lg p-2 text-gray-300"><ExternalLink className="h-4 w-4" /></button>
                  <button aria-label="归档不可用" title="归档功能尚未接入后端" disabled className="cursor-not-allowed rounded-lg p-2 text-gray-300"><Archive className="h-4 w-4" /></button>
                  <button aria-label="更多操作不可用" title="更多操作尚未接入后端" disabled className="cursor-not-allowed rounded-lg p-2 text-gray-300"><MoreVertical className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="flex-1 space-y-4 overflow-y-auto bg-gray-50 p-6">
                {selected.messages.map((message) => (
                  <div key={message.id} className={`flex ${message.sender === 'customer' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`flex max-w-lg items-start gap-2 ${message.sender === 'customer' ? '' : 'flex-row-reverse'}`}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-white">{message.sender === 'customer' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}</div>
                      <div><div className={`rounded-lg px-4 py-3 text-sm ${message.sender === 'customer' ? 'border border-gray-200 bg-white text-gray-900' : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white'}`}>{message.content}</div><div className="mt-1 text-xs text-gray-500">{message.time}</div></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 p-4">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="输入回复内容，提交后进入通知中心人工确认..." rows={3} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                {actionMessage && <p className="mt-2 text-sm text-blue-700">{actionMessage}</p>}
                <div className="mt-2 flex items-center gap-2"><button aria-label="添加附件不可用" title="附件发送尚未接入后端" disabled className="cursor-not-allowed rounded-lg p-2 text-gray-300"><Paperclip className="h-4 w-4" /></button><button aria-label="添加图片不可用" title="图片发送尚未接入后端" disabled className="cursor-not-allowed rounded-lg p-2 text-gray-300"><ImageIcon className="h-4 w-4" /></button><span className="text-xs text-gray-500">当前仅支持文字回复，提交后进入人工审批。</span><div className="flex-1" /><button disabled={!draft.trim() || submittingReply} onClick={submitReply} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{submittingReply ? '正在提交...' : '提交人工确认'}</button></div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center text-gray-500"><MessageCircle className="h-10 w-10 text-gray-300" /><p className="text-sm">连接真实客户消息源后，会话预览将在这里显示。</p><p className="text-xs text-gray-400">可使用页面上方的“刷新实时数据”重新读取。</p></div>
          )}
        </section>
      </div>
    </div>
  );
}
