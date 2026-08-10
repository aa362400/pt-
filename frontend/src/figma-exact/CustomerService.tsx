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
  onOpenOperations?: () => void;
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

export function CustomerService({ conversations, stats, loading = false, onOpenOperations, onSelectConversation, onRequestReply, submittingReply = false, actionMessage }: CustomerServiceProps) {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(conversations[0]?.id ?? null);
  const [draft, setDraft] = useState('');
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
        <h1 className="text-2xl font-bold text-gray-900">Customer Service</h1>
        <p className="mt-1 text-gray-500">AI customer service handles common questions while humans handle complex cases</p>
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
            <h2 className="mb-2 font-bold text-gray-900">AI Customer Service Summary</h2>
            <p className="text-sm text-gray-700">
              {conversations.length > 0
                ? `当前已Sync ${conversations.length} 条真实会话；发送和状态修改仍需在业务操作页确认。`
                : 'No readable Ozon customer-message API is connected yet, so Figma demo conversations are hidden.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid min-h-[520px] grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="flex flex-col rounded-xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" placeholder="Search customers or orders..." className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex items-center gap-2">
              <button className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white">All ({conversations.length})</button>
              <button className="flex-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700">Pending ({conversations.filter((item) => item.status === 'pending').length})</button>
              <button aria-label="Filter会话" className="rounded-lg border border-gray-300 p-1.5"><Filter className="h-4 w-4 text-gray-600" /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-8 text-center text-sm text-gray-500">Reading real conversations...</div>}
            {!loading && conversations.length === 0 && <div className="p-8 text-center text-sm text-gray-500">No real conversation data</div>}
            {conversations.map((conversation) => (
              <button key={conversation.id} onClick={() => selectConversation(conversation)} className={`w-full border-b border-gray-100 p-4 text-left transition-colors ${selected?.id === conversation.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <div className="flex items-start gap-3">
                  <PlatformIcon platform={conversation.platform} />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2"><span className="truncate text-sm font-medium text-gray-900">{conversation.customer}</span><span className="shrink-0 text-xs text-gray-500">{conversation.time}</span></div>
                    <p className="mb-2 truncate text-sm text-gray-600">{conversation.subject}</p>
                    <div className="flex items-center gap-2">
                      {conversation.aiHandled && <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700"><Bot className="h-3 w-3" />AI handled</span>}
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
                  <div><h3 className="font-bold text-gray-900">{selected.customer}</h3><div className="mt-1 flex items-center gap-2"><PlatformIcon platform={selected.platform} /><span className="text-xs text-gray-500">{selected.orderId ? `Order #${selected.orderId}` : 'No linked order'}</span><span className="inline-flex items-center gap-1 rounded bg-orange-50 px-2 py-0.5 text-xs text-orange-700"><Clock className="h-3 w-3" />{selected.status === 'pending' ? 'Pending' : 'Resolved'}</span></div></div>
                </div>
                <div className="flex gap-2"><button onClick={onOpenOperations} aria-label="Open operations page" className="rounded-lg p-2 hover:bg-gray-100"><ExternalLink className="h-4 w-4 text-gray-600" /></button><button onClick={onOpenOperations} aria-label="Archive" className="rounded-lg p-2 hover:bg-gray-100"><Archive className="h-4 w-4 text-gray-600" /></button><button onClick={onOpenOperations} aria-label="More actions" className="rounded-lg p-2 hover:bg-gray-100"><MoreVertical className="h-4 w-4 text-gray-600" /></button></div>
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
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Enter a reply. After submission it goes to Notification Center for human confirmation..." rows={3} className="w-full resize-none rounded-lg border border-gray-300 px-4 py-3 text-sm" />
                {actionMessage && <p className="mt-2 text-sm text-blue-700">{actionMessage}</p>}
                <div className="mt-2 flex items-center gap-2"><button onClick={onOpenOperations} aria-label="Add attachment" className="rounded-lg p-2 hover:bg-gray-100"><Paperclip className="h-4 w-4 text-gray-500" /></button><button onClick={onOpenOperations} aria-label="Add image" className="rounded-lg p-2 hover:bg-gray-100"><ImageIcon className="h-4 w-4 text-gray-500" /></button><div className="flex-1" /><button disabled={!draft.trim() || submittingReply} onClick={submitReply} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{submittingReply ? 'Submitting...' : 'Submit for human confirmation'}</button></div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-12 text-center text-gray-500"><MessageCircle className="h-10 w-10 text-gray-300" /><p className="text-sm">Conversation previews will appear here after a real customer-message source is connected.</p><button onClick={onOpenOperations} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">View integration status</button></div>
          )}
        </section>
      </div>
    </div>
  );
}
