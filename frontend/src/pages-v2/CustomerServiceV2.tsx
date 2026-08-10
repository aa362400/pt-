import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CheckCircle2, Clock, MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  CustomerService,
  type CustomerConversation,
  type CustomerServiceStat,
} from '../figma-exact/CustomerService';
import {
  channelsApi,
  type OzonCustomerOverview,
} from '../api/channels';

function displayTime(value?: string) {
  if (!value) return 'english_text';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default function CustomerServiceV2() {
  const navigate = useNavigate();
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
          customer: chat.type === 'Buyer_Seller' ? 'Ozon text' : chat.type,
          platform: 'Ozon',
          subject: `english_text · ${chat.status}`,
          lastMessage: chat.lastMessage || 'english_textreadmessagetext',
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
          platform: 'Ozon text',
          subject: `producttext · SKU ${question.sku ?? 'english_text'}`,
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
          customer: `Ozon text ${review.rating}/5`,
          platform: 'Ozon text',
          subject: `producttext · SKU ${review.sku || 'english_text'}`,
          lastMessage: review.text || 'english_text',
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
              content: review.text || 'english_text',
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
                      sender: /buyer|customer/i.test(message.sender)
                        ? 'customer'
                        : 'agent',
                      content: message.text || 'english_textmessage',
                      time: displayTime(message.createdAt),
                    })),
                },
          ),
        );
      } catch (error) {
        setActionMessage(`readenglish_textfailed：${errorMessage(error)}`);
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
          `english_textnotificationtexthumantext，approvaltext ${result.notificationId}；textwrite Ozon。`,
        );
      } catch (error) {
        setActionMessage(`textfailed：${errorMessage(error)}`);
      } finally {
        setSubmittingReply(false);
      }
    },
    [overview],
  );

  const stats = useMemo<CustomerServiceStat[]>(
    () => [
      {
        label: 'textreplymessage',
        value: String(
          (overview?.summary.unreadChats ?? 0) +
            (overview?.summary.unprocessedQuestions ?? 0) +
            (overview?.summary.unprocessedReviews ?? 0),
        ),
        icon: MessageCircle,
        color: 'text-orange-600',
      },
      { label: 'AI automatictext', value: '0', icon: Bot, color: 'text-blue-600' },
      {
        label: 'textsynctext/text',
        value: String(conversations.length),
        icon: CheckCircle2,
        color: 'text-green-600',
      },
      {
        label: 'english_text',
        value: overview ? displayTime(overview.fetchedAt) : 'english_text',
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
          Ozon textdatareadfailed：{loadError}
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
              title={source.reason}
            >
              {key}: {source.status === 'connected' ? 'textconnection' : 'text/english_text'}
            </span>
          ))}
          <button
            onClick={() => void loadOverview()}
            className="rounded border border-gray-300 px-2 py-1 text-gray-700"
          >
            english_textdata
          </button>
        </div>
      )}
      <CustomerService
        conversations={conversations}
        stats={stats}
        loading={loading}
        onOpenOperations={() => navigate('/customer-service/operations')}
        onSelectConversation={(conversation) => void loadHistory(conversation)}
        onRequestReply={requestReply}
        submittingReply={submittingReply}
        actionMessage={actionMessage}
      />
    </>
  );
}
