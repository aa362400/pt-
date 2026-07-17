import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Clock, MessageCircle } from 'lucide-react';
import {
  CustomerService,
  type CustomerConversation,
  type CustomerServiceStat,
} from '../figma-exact/CustomerService';
import {
  channelsApi,
  type OzonCustomerOverview,
} from '../api/channels';
import {
  customerChatParticipantLabel,
  customerChatStatusLabel,
  customerChatTypeLabel,
  customerSourceLabel,
  isCustomerMessageSender,
} from '../utils/customer-service-presentation';

function displayTime(value?: string) {
  if (!value) return '时间未返回';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function CustomerServiceV2() {
  const [overview, setOverview] = useState<OzonCustomerOverview | null>(null);
  const [conversations, setConversations] = useState<CustomerConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await channelsApi.customerServiceOverview({ limit: 30 });
      setOverview(data);
      setConversations([
        ...data.chats.map<CustomerConversation>((chat) => ({
          id: `chat:${chat.id}`,
          customer: customerChatParticipantLabel(chat.type),
          platform: 'Ozon',
          subject: `${customerChatTypeLabel(chat.type)} · ${customerChatStatusLabel(chat.status)}`,
          lastMessage: chat.lastMessage || '打开会话读取消息历史',
          time: displayTime(chat.createdAt),
          unread: chat.unreadCount,
          status: chat.status === 'CLOSED' ? 'resolved' : 'pending',
          aiHandled: false,
          priority: chat.unreadCount > 0 ? 'high' : 'low',
          orderId: null,
          messages: [],
        })),
        ...data.questions.map<CustomerConversation>((question) => ({
          id: `question:${question.id}`,
          customer: question.author,
          platform: 'Ozon 问答',
          subject: `商品问题 · SKU ${question.sku ?? '未返回'}`,
          lastMessage: question.text,
          time: displayTime(question.publishedAt),
          unread: question.status === 'PROCESSED' ? 0 : 1,
          status: question.status === 'PROCESSED' ? 'resolved' : 'pending',
          aiHandled: false,
          priority: question.status === 'PROCESSED' ? 'low' : 'high',
          orderId: question.sku ? String(question.sku) : null,
          messages: [
            {
              id: question.id,
              sender: 'customer',
              content: question.text,
              time: displayTime(question.publishedAt),
            },
          ],
        })),
        ...data.reviews.map<CustomerConversation>((review) => ({
          id: `review:${review.id}`,
          customer: `Ozon 评价 ${review.rating}/5`,
          platform: 'Ozon 评价',
          subject: `商品评价 · SKU ${review.sku || '未返回'}`,
          lastMessage: review.text || '买家未填写文字评价',
          time: displayTime(review.publishedAt),
          unread: review.status === 'UNPROCESSED' ? 1 : 0,
          status: review.status === 'UNPROCESSED' ? 'pending' : 'resolved',
          aiHandled: false,
          priority: review.rating <= 3 ? 'high' : 'low',
          orderId: review.sku || null,
          messages: [
            {
              id: review.id,
              sender: 'customer',
              content: review.text || '买家未填写文字评价',
              time: displayTime(review.publishedAt),
            },
          ],
        })),
      ]);
    } catch (error) {
      setLoadError(errorMessage(error));
      setOverview(null);
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const loadHistory = useCallback(
    async (conversation: CustomerConversation) => {
      if (!overview || !conversation.id.startsWith('chat:')) return;
      const targetId = conversation.id.slice('chat:'.length);
      try {
        const history = await channelsApi.customerChatHistory(targetId, {
          channelId: overview.channel.id,
          limit: 100,
        });
        setConversations((current) =>
          current.map((item) =>
            item.id !== conversation.id
              ? item
              : {
                  ...item,
                  messages: history.messages
                    .slice()
                    .reverse()
                    .map((message) => ({
                      id: message.id,
                      sender: isCustomerMessageSender(message.sender)
                        ? 'customer'
                        : 'agent',
                      content: message.text || '非文本消息',
                      time: displayTime(message.createdAt),
                    })),
                },
          ),
        );
      } catch (error) {
        setActionMessage(`读取会话历史失败：${errorMessage(error)}`);
      }
    },
    [overview],
  );

  const requestReply = useCallback(
    async (conversation: CustomerConversation, text: string) => {
      if (!overview) return;
      const separator = conversation.id.indexOf(':');
      const type = conversation.id.slice(0, separator);
      const targetId = conversation.id.slice(separator + 1);
      const action =
        type === 'chat'
          ? 'CHAT_REPLY'
          : type === 'question'
            ? 'QUESTION_ANSWER'
            : 'REVIEW_COMMENT';
      setSubmittingReply(true);
      setActionMessage(null);
      try {
        const result = await channelsApi.requestCustomerAction(targetId, {
          channelId: overview.channel.id,
          action,
          text,
          ...(action === 'QUESTION_ANSWER' && conversation.orderId
            ? { sku: Number(conversation.orderId) }
            : {}),
        });
        setActionMessage(
          `已进入通知中心人工确认，审批单 ${result.notificationId}；尚未写入 Ozon。`,
        );
      } catch (error) {
        setActionMessage(`提交失败：${errorMessage(error)}`);
      } finally {
        setSubmittingReply(false);
      }
    },
    [overview],
  );

  const stats = useMemo<CustomerServiceStat[]>(
    () => [
      {
        label: '待回复消息',
        value: String(
          (overview?.summary.unreadChats ?? 0) +
            (overview?.summary.unprocessedQuestions ?? 0) +
            (overview?.summary.unprocessedReviews ?? 0),
        ),
        icon: MessageCircle,
        color: 'text-orange-600',
      },
      { label: 'AI 自动处理', value: '0', icon: Bot, color: 'text-blue-600' },
      {
        label: '已同步会话/反馈',
        value: String(conversations.length),
        icon: CheckCircle2,
        color: 'text-green-600',
      },
      {
        label: '抓取时间',
        value: overview ? displayTime(overview.fetchedAt) : '未返回',
        icon: Clock,
        color: 'text-purple-600',
      },
    ],
    [conversations.length, overview],
  );

  return (
    <>
      {loadError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Ozon 客服数据读取失败：{loadError}
        </div>
      )}
      {overview && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-gray-600">
          {Object.entries(overview.sources).map(([key, source]) => (
            <span
              key={key}
              className={`rounded border px-2 py-1 ${
                source.status === 'connected'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-orange-200 bg-orange-50 text-orange-700'
              }`}
              title={
                source.status === 'connected'
                  ? `${customerSourceLabel(key)}已连接`
                  : `${customerSourceLabel(key)}需要相应订阅或权限，当前账号不可用`
              }
            >
              {customerSourceLabel(key)}：
              {source.status === 'connected' ? '已连接' : '订阅或权限不可用'}
            </span>
          ))}
          <button
            onClick={() => void loadOverview()}
            className="rounded border border-gray-300 px-2 py-1 text-gray-700"
          >
            刷新实时数据
          </button>
        </div>
      )}
      <CustomerService
        conversations={conversations}
        stats={stats}
        loading={loading}
        onSelectConversation={(conversation) => void loadHistory(conversation)}
        onRequestReply={requestReply}
        submittingReply={submittingReply}
        actionMessage={actionMessage}
      />
    </>
  );
}
