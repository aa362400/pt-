import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { JwtPayload } from '../../shared/auth/jwt.strategy.js';
import { requireOrg } from '../../shared/tenancy/org-scope.js';
import { TenantDatabaseContextService } from '../../shared/database/tenant-database-context.service.js';
import { ActionProposalsService } from '../notifications/action-proposals.service.js';
import { OzonCredentialsService } from './ozon-credentials.service.js';
import { OzonSellerApiClient } from './ozon-seller-api.client.js';
import type {
  OzonCustomerOverviewQueryDto,
  RequestOzonCustomerActionDto,
} from './channels.dto.js';

@Injectable()
export class OzonCustomerServiceService {
  constructor(
    private readonly tenantDatabase: TenantDatabaseContextService,
    private readonly credentials: OzonCredentialsService,
    private readonly client: OzonSellerApiClient,
    private readonly actionProposals: ActionProposalsService,
  ) {}

  async overview(user: JwtPayload, query: OzonCustomerOverviewQueryDto) {
    const organizationId = requireOrg(user);
    const channel = await this.findSellerChannel(
      organizationId,
      query.workspaceId,
    );
    const credentials = await this.credentials.decode(
      channel.accessTokenEncrypted,
    );
    const limit = query.limit ?? 30;
    const [chats, questions, reviews] = await Promise.allSettled([
      this.client.listCustomerChats(credentials, { limit }),
      this.client.listCustomerQuestions(credentials, { limit }),
      this.client.listCustomerReviews(credentials, {
        limit: Math.max(limit, 20),
      }),
    ]);

    const chatItems =
      chats.status === 'fulfilled'
        ? chats.value.chats.map((item) => this.mapChat(item))
        : [];
    const questionItems =
      questions.status === 'fulfilled'
        ? questions.value.questions.map((item) => this.mapQuestion(item))
        : [];
    const reviewItems =
      reviews.status === 'fulfilled'
        ? reviews.value.reviews.map((item) => this.mapReview(item))
        : [];

    return {
      source: 'Ozon Seller API',
      docs: 'https://docs.ozon.ru/api/seller/',
      fetchedAt: new Date().toISOString(),
      channel: this.safeChannel(channel),
      summary: {
        chats: chatItems.length,
        unreadChats:
          chats.status === 'fulfilled' ? chats.value.totalUnreadCount : 0,
        questions: questionItems.length,
        unprocessedQuestions: questionItems.filter(
          (item) => item.status !== 'PROCESSED',
        ).length,
        reviews: reviewItems.length,
        unprocessedReviews: reviewItems.filter(
          (item) => item.status === 'UNPROCESSED',
        ).length,
      },
      chats: chatItems,
      questions: questionItems,
      reviews: reviewItems,
      sources: {
        chats: this.sourceState(chats),
        questions: this.sourceState(questions, 'Premium Plus'),
        reviews: this.sourceState(reviews, 'english_text Premium Pro'),
      },
      guardrails: {
        readOnlyAutomatic: true,
        repliesRequireHumanConfirmation: true,
        directAutomaticReply: false,
      },
    };
  }

  async history(
    user: JwtPayload,
    input: { channelId: string; chatId: string; limit?: number },
  ) {
    const organizationId = requireOrg(user);
    const channel = await this.findOwnedSellerChannel(
      organizationId,
      input.channelId,
    );
    const credentials = await this.credentials.decode(
      channel.accessTokenEncrypted,
    );
    const result = await this.client.getCustomerChatHistory(credentials, {
      chatId: input.chatId,
      limit: input.limit,
    });
    return {
      source: 'Ozon Seller API /v3/chat/history',
      fetchedAt: new Date().toISOString(),
      channelId: channel.id,
      chatId: input.chatId,
      hasNext: result.hasNext,
      messages: result.messages.map((message) => this.mapMessage(message)),
    };
  }

  async requestAction(
    user: JwtPayload,
    targetId: string,
    dto: RequestOzonCustomerActionDto,
  ) {
    const organizationId = requireOrg(user);
    const channel = await this.findOwnedSellerChannel(
      organizationId,
      dto.channelId,
    );
    const text = dto.text.trim();
    if (!text) throw new BadRequestException('replyenglish_text');
    if (dto.action === 'QUESTION_ANSWER' && !dto.sku) {
      throw new BadRequestException('text Ozon productenglish_text SKU');
    }

    const actionName =
      dto.action === 'CHAT_REPLY'
        ? 'ozon.chat.send_message'
        : dto.action === 'QUESTION_ANSWER'
          ? 'ozon.question.answer'
          : 'ozon.review.comment';
    const label =
      dto.action === 'CHAT_REPLY'
        ? 'english_textmessage'
        : dto.action === 'QUESTION_ANSWER'
          ? 'textproducttext'
          : 'replyproducttext';
    const { notification } = await this.actionProposals.create({
      organizationId,
      requestedBy: user.sub,
      approverId: user.sub,
      source: 'ozon_customer_service',
      action: {
        label: 'Execute',
        name: actionName,
        params: {
          channelId: channel.id,
          workspaceId: channel.workspaceId,
          targetId,
          text,
          ...(dto.sku ? { sku: dto.sku } : {}),
        },
      },
      type: 'APPROVAL_REQUIRED',
      title: `english_text Ozon english_text：${label}`,
      body:
        `text ${targetId} textreplyenglish_texthumantext。` +
        'textyestextnotificationenglish_text“text”english_textwrite Ozon。',
      context: {
        kind: 'high_risk_action_review',
        source: 'ozon_customer_service',
        provider: 'OZON',
        riskLevel: 'high',
        requiresConfirmation: true,
        externalStoreMutation: 'blocked_until_human_confirmation',
        action: {
          label: 'text',
          action: actionName,
          params: {
            channelId: channel.id,
            workspaceId: channel.workspaceId,
            targetId,
            text,
            ...(dto.sku ? { sku: dto.sku } : {}),
          },
        },
        execution: { status: 'pending_confirmation' },
        guardrails: [
          'english_textwritetextautomatictext',
          'notificationenglish_text Ozon Seller API',
        ],
      },
    });
    return {
      status: 'pending_human_confirmation',
      notificationId: notification.id,
      action: actionName,
      targetId,
    };
  }

  private async findSellerChannel(
    organizationId: string,
    workspaceId?: string,
  ) {
    const channel = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findFirst({
        where: {
          provider: 'OZON',
          syncStatus: { not: 'DISCONNECTED' },
          workspace: { organizationId },
          ...(workspaceId ? { workspaceId } : {}),
        },
        orderBy: { lastSyncedAt: { sort: 'desc', nulls: 'last' } },
      }),
    );
    if (!channel) {
      throw new NotFoundException('english_textconnectiontext Ozon Seller API store');
    }
    return channel;
  }

  private async findOwnedSellerChannel(
    organizationId: string,
    channelId: string,
  ) {
    const channel = await this.tenantDatabase.run(organizationId, (tx) =>
      tx.channelConnection.findFirst({
        where: {
          id: channelId,
          provider: 'OZON',
          workspace: { organizationId },
        },
      }),
    );
    if (!channel) throw new NotFoundException('Ozon storeconnectionenglish_text');
    return channel;
  }

  private sourceState(
    result: PromiseSettledResult<unknown>,
    subscription?: string,
  ) {
    return result.status === 'fulfilled'
      ? { status: 'connected' as const, subscription: subscription ?? null }
      : {
          status: 'unavailable' as const,
          subscription: subscription ?? null,
          reason: this.errorMessage(result.reason),
        };
  }

  private mapChat(item: Record<string, unknown>) {
    const chat = this.asRecord(item.chat);
    const lastMessage = this.asRecord(item.last_message);
    return {
      id: this.asString(chat.chat_id ?? item.chat_id),
      type: this.asString(chat.chat_type ?? item.chat_type) || 'UNKNOWN',
      status: this.asString(chat.chat_status ?? item.chat_status) || 'UNKNOWN',
      createdAt: this.asString(chat.created_at ?? item.created_at),
      unreadCount: this.asNumber(item.unread_count) ?? 0,
      lastMessage: this.asString(
        lastMessage.data ?? lastMessage.text ?? item.last_message_text,
      ),
      raw: item,
    };
  }

  private mapQuestion(item: Record<string, unknown>) {
    return {
      id: this.asString(item.id),
      sku: this.asNumber(item.sku),
      author: this.asString(item.author_name) || 'Ozon text',
      text: this.asString(item.text),
      status: this.asString(item.status) || 'UNKNOWN',
      publishedAt: this.asString(item.published_at),
      productUrl: this.asString(item.product_url),
      questionUrl: this.asString(item.question_link),
      answersCount: this.asNumber(item.answers_count) ?? 0,
    };
  }

  private mapReview(item: Record<string, unknown>) {
    return {
      id: this.asString(item.id),
      sku: this.asString(item.sku),
      text: this.asString(item.text),
      rating: this.asNumber(item.rating) ?? 0,
      status: this.asString(item.status) || 'UNKNOWN',
      publishedAt: this.asString(item.published_at),
      commentsCount: this.asNumber(item.comments_amount) ?? 0,
      photosCount: this.asNumber(item.photos_amount) ?? 0,
      videosCount: this.asNumber(item.videos_amount) ?? 0,
    };
  }

  private mapMessage(item: Record<string, unknown>) {
    const data = this.asRecord(item.data);
    const user = this.asRecord(item.user);
    return {
      id: this.asString(item.message_id ?? item.id),
      text: this.asString(data.data ?? data.text ?? item.text),
      createdAt: this.asString(item.created_at),
      sender: this.asString(user.type ?? item.user_type) || 'UNKNOWN',
      isRead: item.is_read === true,
    };
  }

  private safeChannel(channel: {
    id: string;
    workspaceId: string;
    externalShopId: string | null;
    syncStatus: string;
    lastSyncedAt: Date | null;
  }) {
    return {
      id: channel.id,
      workspaceId: channel.workspaceId,
      externalShopId: channel.externalShopId,
      syncStatus: channel.syncStatus,
      lastSyncedAt: channel.lastSyncedAt,
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asString(value: unknown) {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value);
    return '';
  }

  private asNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
