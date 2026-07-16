import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { OzonCredentials } from './ozon-credentials.service.js';

export interface OzonProductRef {
  productId?: number;
  offerId?: string;
}

interface OzonProductRefPage {
  items: OzonProductRef[];
  lastId?: string;
}

interface OzonPostingPage {
  postings: unknown[];
  cursor?: string;
  hasNext: boolean;
}

interface OzonPostOptions {
  retryRateLimit?: boolean;
}

const OZON_RATE_LIMIT_RETRIES = 2;
const OZON_RATE_LIMIT_FALLBACK_MS = 250;
const OZON_RATE_LIMIT_MAX_DELAY_MS = 30_000;

export interface OzonProductInfo {
  productId?: number;
  offerId?: string;
  name?: string;
  price?: string;
  currencyCode?: string;
  images: string[];
  status?: string;
  raw: Record<string, unknown>;
}

export interface OzonOrderPosting {
  fulfillmentType: 'FBS' | 'FBO';
  postingNumber: string;
  orderId?: string;
  status: string;
  orderedAt?: string;
  deliveredAt?: string;
  currencyCode?: string;
  totalAmount: number;
  itemCount: number;
  raw: Record<string, unknown>;
}

export interface OzonOrderPostingsResult {
  items: OzonOrderPosting[];
  failures: Array<{ fulfillmentType: 'FBS' | 'FBO'; message: string }>;
}

export interface OzonProductPriceUpdate {
  productId?: number;
  offerId?: string;
  price: number;
  currencyCode?: string;
}

export interface OzonProductPriceUpdateItem {
  productId?: number;
  offerId?: string;
  updated: boolean;
  errors: Array<{ code?: string; message: string }>;
  raw: Record<string, unknown>;
}

export interface OzonProductPriceUpdateResult {
  items: OzonProductPriceUpdateItem[];
  failures: Array<{
    productId?: number;
    offerId?: string;
    message: string;
  }>;
}

export interface OzonProductStockUpdate {
  productId?: number;
  offerId?: string;
  warehouseId: number;
  stock: number;
}

export interface OzonProductStockUpdateItem {
  productId?: number;
  offerId?: string;
  warehouseId?: number;
  updated: boolean;
  errors: Array<{ code?: string; message: string }>;
  raw: Record<string, unknown>;
}

export interface OzonProductStockUpdateResult {
  items: OzonProductStockUpdateItem[];
  failures: Array<{
    productId?: number;
    offerId?: string;
    warehouseId?: number;
    message: string;
  }>;
}

export interface OzonProductStockInfo extends OzonProductRef {
  warehouseId?: number;
  stock?: number;
  raw: Record<string, unknown>;
}

export interface OzonProductImportInput {
  attributes: Array<Record<string, unknown>>;
  descriptionCategoryId: number;
  dimensionUnit: string;
  height: number;
  width: number;
  depth: number;
  weight: number;
  weightUnit: string;
  images: string[];
  name: string;
  offerId: string;
  price: number;
  vat: string;
  barcode?: string;
  oldPrice?: number;
  currencyCode?: string;
}

export interface OzonProductImportResult {
  taskId?: number;
  raw: Record<string, unknown>;
}

export interface OzonProductImportInfoItem {
  productId?: number;
  offerId?: string;
  errors: Array<{ code?: string; message: string }>;
  raw: Record<string, unknown>;
}

export interface OzonProductImportInfoResult {
  items: OzonProductImportInfoItem[];
  raw: Record<string, unknown>;
}

export interface OzonCustomerChatListResult {
  chats: Array<Record<string, unknown>>;
  totalUnreadCount: number;
  cursor?: string;
  hasNext: boolean;
  raw: Record<string, unknown>;
}

export interface OzonCustomerChatHistoryResult {
  messages: Array<Record<string, unknown>>;
  hasNext: boolean;
  raw: Record<string, unknown>;
}

export interface OzonCustomerQuestionListResult {
  questions: Array<Record<string, unknown>>;
  lastId?: string;
  hasNext: boolean;
  raw: Record<string, unknown>;
}

export interface OzonCustomerReviewListResult {
  reviews: Array<Record<string, unknown>>;
  lastId?: string;
  hasNext: boolean;
  raw: Record<string, unknown>;
}

export interface OzonRfbsReturnAction {
  id: number;
  name: string;
}

export interface OzonRfbsReturnState {
  state?: string;
  stateName?: string;
  moneyReturnStateName?: string;
}

export interface OzonRfbsReturnInfo {
  returnId: number;
  returnNumber?: string;
  postingNumber?: string;
  availableActions: OzonRfbsReturnAction[];
  product: OzonRfbsReturnListItem['product'];
  state: OzonRfbsReturnState;
  raw: Record<string, unknown>;
}

export interface OzonRfbsReturnListItem {
  returnId: number;
  returnNumber?: string;
  postingNumber?: string;
  orderNumber?: string;
  createdAt?: string;
  product: {
    name?: string;
    offerId?: string;
    sku?: number;
    price?: string;
    currencyCode?: string;
  };
  state: OzonRfbsReturnState & { groupState?: string };
}

export interface OzonRfbsReturnListResult {
  items: OzonRfbsReturnListItem[];
  hasNext: boolean;
}

export interface OzonRfbsReturnActionInput {
  returnId: number;
  actionId: number;
  returnForBackWay: number;
}

@Injectable()
export class OzonSellerApiClient {
  constructor(private readonly configService: ConfigService) {}

  async verifyCredentials(credentials: OzonCredentials) {
    const response = await this.post<Record<string, unknown>>(
      '/v3/product/list',
      credentials,
      {
        filter: { visibility: 'ALL' },
        limit: 1,
      },
    );
    const result = this.asRecord(response.result);
    const items = this.asArray(result.items);
    return {
      ok: true,
      total: this.asNumber(result.total),
      sampleCount: items.length,
      lastId: this.asOptionalString(result.last_id),
    };
  }

  async listProductRefs(
    credentials: OzonCredentials,
    limit = 50,
  ): Promise<OzonProductRef[]> {
    const page = await this.listProductRefsPage(credentials, limit);
    return page.items;
  }

  async listAllProductRefs(
    credentials: OzonCredentials,
    options: { maxItems?: number } = {},
  ): Promise<OzonProductRef[]> {
    const maxItems = Math.min(Math.max(options.maxItems ?? 50_000, 1), 50_000);
    const pageSize = Math.min(maxItems, 100);
    const results: OzonProductRef[] = [];
    const seenProducts = new Set<string>();
    const seenCursors = new Set<string>();
    let lastId: string | undefined;

    while (results.length < maxItems) {
      const page = await this.listProductRefsPage(
        credentials,
        Math.min(pageSize, maxItems - results.length),
        lastId,
      );
      for (const item of page.items) {
        const identity = item.productId
          ? `product:${item.productId}`
          : `offer:${item.offerId}`;
        if (!seenProducts.has(identity)) {
          seenProducts.add(identity);
          results.push(item);
        }
      }

      if (!page.lastId || page.items.length === 0) {
        break;
      }
      if (seenCursors.has(page.lastId)) {
        throw new BadRequestException(
          'Ozon product pagination returned a repeated cursor',
        );
      }
      seenCursors.add(page.lastId);
      lastId = page.lastId;
    }

    return results;
  }

  private async listProductRefsPage(
    credentials: OzonCredentials,
    limit: number,
    lastId?: string,
  ): Promise<OzonProductRefPage> {
    const response = await this.post<Record<string, unknown>>(
      '/v3/product/list',
      credentials,
      {
        filter: { visibility: 'ALL' },
        limit,
        ...(lastId ? { last_id: lastId } : {}),
      },
    );
    const result = this.asRecord(response.result);
    const items = this.asArray(result.items)
      .map((item) => this.asRecord(item))
      .map((item) => ({
        productId: this.asNumber(item.product_id),
        offerId: this.asOptionalString(item.offer_id),
      }))
      .filter((item) => this.hasUsableProductRef(item));
    return {
      items,
      lastId: this.asOptionalString(result.last_id),
    };
  }

  async getProductInfoList(
    credentials: OzonCredentials,
    refs: OzonProductRef[],
  ): Promise<OzonProductInfo[]> {
    if (refs.length === 0) {
      return [];
    }

    const productIds = refs
      .map((item) => item.productId)
      .filter((item): item is number => typeof item === 'number');
    const offerIds = refs
      .map((item) => item.offerId)
      .filter((item): item is string => !!item);

    const body: Record<string, unknown> = {};
    if (productIds.length > 0) {
      body.product_id = productIds;
    } else if (offerIds.length > 0) {
      body.offer_id = offerIds;
    }
    if (Object.keys(body).length === 0) {
      return [];
    }

    const response = await this.post<Record<string, unknown>>(
      '/v3/product/info/list',
      credentials,
      body,
    );
    const result = this.asRecord(response.result);
    const items =
      this.asArray(response.items).length > 0
        ? this.asArray(response.items)
        : this.asArray(result.items);
    return items.map((item) => this.mapProductInfo(this.asRecord(item)));
  }

  async listOrderPostings(
    credentials: OzonCredentials,
    options: { since: string; to: string; limit?: number },
  ): Promise<OzonOrderPostingsResult> {
    const limit = Math.min(Math.max(options.limit ?? 100, 1), 100);
    const results = await Promise.allSettled([
      this.listFbsPostings(credentials, options.since, options.to, limit),
      this.listFboPostings(credentials, options.since, options.to, limit),
    ]);
    const items: OzonOrderPosting[] = [];
    const failures: OzonOrderPostingsResult['failures'] = [];

    results.forEach((result, index) => {
      const fulfillmentType = index === 0 ? 'FBS' : 'FBO';
      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        failures.push({
          fulfillmentType,
          message:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        });
      }
    });

    if (items.length === 0 && failures.length === results.length) {
      throw new BadRequestException({
        message: 'Ozon Seller API order sync failed for FBS and FBO postings',
        details: failures,
      });
    }

    return { items, failures };
  }

  async probeOrderPostingEndpoint(
    credentials: OzonCredentials,
    fulfillmentType: 'FBS' | 'FBO',
    options: { since: string; to: string; limit?: number },
  ): Promise<{ fulfillmentType: 'FBS' | 'FBO'; fetched: number }> {
    const limit = Math.min(Math.max(options.limit ?? 5, 1), 100);
    const items =
      fulfillmentType === 'FBS'
        ? await this.listFbsPostings(
            credentials,
            options.since,
            options.to,
            limit,
          )
        : await this.listFboPostings(
            credentials,
            options.since,
            options.to,
            limit,
          );
    return { fulfillmentType, fetched: items.length };
  }

  async listCustomerChats(
    credentials: OzonCredentials,
    options: { limit?: number; cursor?: string; unreadOnly?: boolean } = {},
  ): Promise<OzonCustomerChatListResult> {
    const response = await this.post<Record<string, unknown>>(
      '/v3/chat/list',
      credentials,
      {
        filter: {
          chat_status: 'OPENED',
          unread_only: options.unreadOnly ?? false,
        },
        limit: Math.min(Math.max(options.limit ?? 30, 1), 100),
        ...(options.cursor ? { cursor: options.cursor } : {}),
      },
    );
    return {
      chats: this.asArray(response.chats).map((item) => this.asRecord(item)),
      totalUnreadCount: this.asNumber(response.total_unread_count) ?? 0,
      cursor: this.asOptionalString(response.cursor),
      hasNext: response.has_next === true,
      raw: response,
    };
  }

  async getCustomerChatHistory(
    credentials: OzonCredentials,
    options: { chatId: string; limit?: number },
  ): Promise<OzonCustomerChatHistoryResult> {
    const response = await this.post<Record<string, unknown>>(
      '/v3/chat/history',
      credentials,
      {
        chat_id: options.chatId,
        direction: 'Backward',
        limit: Math.min(Math.max(options.limit ?? 50, 1), 1000),
      },
    );
    return {
      messages: this.asArray(response.messages).map((item) =>
        this.asRecord(item),
      ),
      hasNext: response.has_next === true,
      raw: response,
    };
  }

  async listCustomerQuestions(
    credentials: OzonCredentials,
    options: { limit?: number; lastId?: string } = {},
  ): Promise<OzonCustomerQuestionListResult> {
    const response = await this.post<Record<string, unknown>>(
      '/v1/question/list',
      credentials,
      {
        filter: { status: 'ALL' },
        limit: Math.min(Math.max(options.limit ?? 30, 1), 100),
        last_id: options.lastId ?? '',
        sort_dir: 'DESC',
      },
    );
    return {
      questions: this.asArray(response.questions).map((item) =>
        this.asRecord(item),
      ),
      lastId: this.asOptionalString(response.last_id),
      hasNext: response.has_next === true,
      raw: response,
    };
  }

  async listCustomerReviews(
    credentials: OzonCredentials,
    options: { limit?: number; lastId?: string } = {},
  ): Promise<OzonCustomerReviewListResult> {
    const response = await this.post<Record<string, unknown>>(
      '/v2/review/list',
      credentials,
      {
        filters: {},
        limit: Math.min(Math.max(options.limit ?? 20, 20), 100),
        ...(options.lastId ? { last_id: options.lastId } : {}),
        sort_dir: 'DESC',
      },
    );
    return {
      reviews: this.asArray(response.reviews).map((item) =>
        this.asRecord(item),
      ),
      lastId: this.asOptionalString(response.last_id),
      hasNext: response.has_next === true,
      raw: response,
    };
  }

  async sendCustomerChatMessage(
    credentials: OzonCredentials,
    input: { chatId: string; text: string },
  ) {
    return this.post<Record<string, unknown>>(
      '/v1/chat/send/message',
      credentials,
      { chat_id: input.chatId, text: input.text },
    );
  }

  async answerCustomerQuestion(
    credentials: OzonCredentials,
    input: { questionId: string; sku: number; text: string },
  ) {
    return this.post<Record<string, unknown>>(
      '/v1/question/answer/create',
      credentials,
      { question_id: input.questionId, sku: input.sku, text: input.text },
    );
  }

  async commentOnCustomerReview(
    credentials: OzonCredentials,
    input: { reviewId: string; text: string },
  ) {
    return this.post<Record<string, unknown>>(
      '/v1/review/comment/create',
      credentials,
      {
        review_id: input.reviewId,
        text: input.text,
        mark_review_as_processed: true,
      },
    );
  }

  async getRfbsReturn(
    credentials: OzonCredentials,
    returnId: number,
  ): Promise<OzonRfbsReturnInfo> {
    if (!Number.isInteger(returnId) || returnId <= 0) {
      throw new BadRequestException(
        'Ozon rFBS return_id must be a positive integer',
      );
    }
    const response = await this.post<Record<string, unknown>>(
      '/v2/returns/rfbs/get',
      credentials,
      { return_id: returnId },
    );
    const item = this.asRecord(response.returns ?? response.result);
    const state = this.asRecord(item.state);
    const product = this.asRecord(item.product);
    const availableActions = this.asArray(item.available_actions)
      .map((value) => this.asRecord(value))
      .map((value) => ({
        id: this.asNumber(value.id) ?? 0,
        name: this.asOptionalString(value.name) ?? '',
      }))
      .filter((value) => value.id > 0 && value.name.length > 0);

    return {
      returnId,
      returnNumber: this.asOptionalString(item.return_number),
      postingNumber: this.asOptionalString(item.posting_number),
      availableActions,
      product: {
        name: this.asOptionalString(product.name),
        offerId: this.asOptionalString(product.offer_id),
        sku: this.asNumber(product.sku),
        price: this.asOptionalString(product.price),
        currencyCode: this.asOptionalString(product.currency_code),
      },
      state: {
        state: this.asOptionalString(state.state),
        stateName: this.asOptionalString(state.state_name),
        moneyReturnStateName: this.asOptionalString(
          state.money_return_state_name,
        ),
      },
      raw: item,
    };
  }

  async listRfbsReturns(
    credentials: OzonCredentials,
    options: { limit?: number; postingNumber?: string } = {},
  ): Promise<OzonRfbsReturnListResult> {
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
    const response = await this.post<Record<string, unknown>>(
      '/v2/returns/rfbs/list',
      credentials,
      {
        filter: options.postingNumber
          ? { posting_number: options.postingNumber }
          : {},
        last_id: 0,
        limit,
      },
    );
    const rawReturns = Array.isArray(response.returns)
      ? response.returns
      : response.returns && typeof response.returns === 'object'
        ? [response.returns]
        : [];
    const items = rawReturns
      .map((value) => this.asRecord(value))
      .map((item) => {
        const state = this.asRecord(item.state);
        const product = this.asRecord(item.product);
        return {
          returnId: this.asNumber(item.return_id) ?? 0,
          returnNumber: this.asOptionalString(item.return_number),
          postingNumber: this.asOptionalString(item.posting_number),
          orderNumber: this.asOptionalString(item.order_number),
          createdAt: this.asOptionalString(item.created_at),
          product: {
            name: this.asOptionalString(product.name),
            offerId: this.asOptionalString(product.offer_id),
            sku: this.asNumber(product.sku),
            price: this.asOptionalString(product.price),
            currencyCode: this.asOptionalString(product.currency_code),
          },
          state: {
            groupState: this.asOptionalString(state.group_state),
            state: this.asOptionalString(state.state),
            stateName: this.asOptionalString(state.state_name),
            moneyReturnStateName: this.asOptionalString(
              state.money_return_state_name,
            ),
          },
        };
      })
      .filter((item) => item.returnId > 0);
    return {
      items,
      hasNext: response.has_next === true,
    };
  }

  async setRfbsReturnAction(
    credentials: OzonCredentials,
    input: OzonRfbsReturnActionInput,
  ): Promise<{ accepted: true }> {
    if (!Number.isInteger(input.returnId) || input.returnId <= 0) {
      throw new BadRequestException(
        'Ozon rFBS return_id must be a positive integer',
      );
    }
    if (!Number.isInteger(input.actionId) || input.actionId <= 0) {
      throw new BadRequestException(
        'Ozon rFBS action id must be a positive integer',
      );
    }
    if (
      !Number.isFinite(input.returnForBackWay) ||
      input.returnForBackWay < 0
    ) {
      throw new BadRequestException(
        'Ozon rFBS return_for_back_way must be a non-negative amount',
      );
    }
    await this.post<Record<string, unknown>>(
      '/v1/returns/rfbs/action/set',
      credentials,
      {
        id: input.actionId,
        return_for_back_way: input.returnForBackWay,
        return_id: input.returnId,
      },
    );
    return { accepted: true };
  }

  async updateProductPrices(
    credentials: OzonCredentials,
    updates: OzonProductPriceUpdate[],
  ): Promise<OzonProductPriceUpdateResult> {
    if (updates.length === 0) {
      throw new BadRequestException(
        'At least one Ozon product price update is required',
      );
    }

    const response = await this.post<Record<string, unknown>>(
      '/v1/product/import/prices',
      credentials,
      {
        prices: updates.map((item) => this.toOzonPricePayload(item)),
      },
    );
    const result = response.result;
    const rawItems = Array.isArray(result)
      ? result
      : this.asArray(this.asRecord(result).items);
    const items = rawItems.map((item) =>
      this.mapPriceUpdateItem(this.asRecord(item)),
    );
    return {
      items,
      failures: items
        .filter((item) => !item.updated || item.errors.length > 0)
        .map((item) => ({
          productId: item.productId,
          offerId: item.offerId,
          message:
            item.errors.map((error) => error.message).join('; ') ||
            'Ozon did not confirm the price update',
        })),
    };
  }

  async updateProductStocks(
    credentials: OzonCredentials,
    updates: OzonProductStockUpdate[],
  ): Promise<OzonProductStockUpdateResult> {
    if (updates.length === 0) {
      throw new BadRequestException(
        'At least one Ozon product stock update is required',
      );
    }

    const response = await this.post<Record<string, unknown>>(
      '/v2/products/stocks',
      credentials,
      {
        stocks: updates.map((item) => this.toOzonStockPayload(item)),
      },
    );
    const result = response.result;
    const rawItems = Array.isArray(result)
      ? result
      : this.asArray(this.asRecord(result).items);
    const items = rawItems.map((item) =>
      this.mapStockUpdateItem(this.asRecord(item)),
    );
    return {
      items,
      failures: items
        .filter((item) => !item.updated || item.errors.length > 0)
        .map((item) => ({
          productId: item.productId,
          offerId: item.offerId,
          warehouseId: item.warehouseId,
          message:
            item.errors.map((error) => error.message).join('; ') ||
            'Ozon did not confirm the stock update',
        })),
    };
  }

  async importProducts(
    credentials: OzonCredentials,
    items: OzonProductImportInput[],
  ): Promise<OzonProductImportResult> {
    if (items.length === 0) {
      throw new BadRequestException(
        'At least one Ozon product import item is required',
      );
    }
    const response = await this.post<Record<string, unknown>>(
      '/v3/product/import',
      credentials,
      { items: items.map((item) => this.toProductImportPayload(item)) },
    );
    const result = this.asRecord(response.result);
    return {
      taskId: this.asNumber(result.task_id ?? response.task_id),
      raw: response,
    };
  }

  async getProductImportInfo(
    credentials: OzonCredentials,
    taskId: number,
  ): Promise<OzonProductImportInfoResult> {
    if (!Number.isInteger(taskId) || taskId <= 0) {
      throw new BadRequestException('A valid Ozon import task ID is required');
    }
    const response = await this.post<Record<string, unknown>>(
      '/v1/product/import/info',
      credentials,
      { task_id: taskId },
    );
    const result = this.asRecord(response.result);
    const items = this.asArray(result.items)
      .map((item) => this.asRecord(item))
      .map((item) => ({
        productId: this.asNumber(item.product_id ?? item.productId),
        offerId: this.asOptionalString(item.offer_id ?? item.offerId),
        errors: this.asArray(item.errors).map((error) =>
          this.mapPriceUpdateError(error),
        ),
        raw: item,
      }));
    return { items, raw: response };
  }

  async getProductStocks(
    credentials: OzonCredentials,
    refs: OzonProductRef[],
  ): Promise<OzonProductStockInfo[]> {
    if (refs.length === 0) {
      return [];
    }

    const productIds = refs
      .map((item) => item.productId)
      .filter((item): item is number => typeof item === 'number');
    const offerIds = refs
      .map((item) => item.offerId)
      .filter((item): item is string => !!item);
    const filter: Record<string, unknown> = { visibility: 'ALL' };
    if (productIds.length > 0) {
      filter.product_id = productIds;
    } else if (offerIds.length > 0) {
      filter.offer_id = offerIds;
    }
    if (!filter.product_id && !filter.offer_id) {
      return [];
    }

    const response = await this.post<Record<string, unknown>>(
      '/v4/product/info/stocks',
      credentials,
      { filter, limit: Math.min(Math.max(refs.length, 1), 100) },
    );
    const result = this.asRecord(response.result);
    const items =
      this.asArray(response.items).length > 0
        ? this.asArray(response.items)
        : this.asArray(result.items);
    return items.flatMap((item) =>
      this.mapProductStockInfos(this.asRecord(item)),
    );
  }

  private async listFbsPostings(
    credentials: OzonCredentials,
    since: string,
    to: string,
    limit: number,
  ): Promise<OzonOrderPosting[]> {
    return this.listPostingPages(
      'FBS',
      '/v4/posting/fbs/list',
      credentials,
      {
        dir: 'ASC',
        filter: { since, to },
        with: {
          analytics_data: true,
          financial_data: true,
        },
      },
      limit,
    );
  }

  private async listFboPostings(
    credentials: OzonCredentials,
    since: string,
    to: string,
    limit: number,
  ): Promise<OzonOrderPosting[]> {
    return this.listPostingPages(
      'FBO',
      '/v3/posting/fbo/list',
      credentials,
      {
        dir: 'ASC',
        filter: { since, to },
        translit: true,
        with: {
          analytics_data: true,
          financial_data: true,
        },
      },
      limit,
    );
  }

  private async listPostingPages(
    fulfillmentType: 'FBS' | 'FBO',
    path: string,
    credentials: OzonCredentials,
    baseBody: Record<string, unknown>,
    limit: number,
  ): Promise<OzonOrderPosting[]> {
    const items: OzonOrderPosting[] = [];
    const seenPostings = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor = '';

    while (true) {
      const response = await this.post<Record<string, unknown>>(
        path,
        credentials,
        {
          ...baseBody,
          limit,
          cursor,
        },
        { retryRateLimit: true },
      );
      const page = this.extractPostingPage(response);

      for (const rawPosting of page.postings) {
        const posting = this.mapOrderPosting(
          fulfillmentType,
          this.asRecord(rawPosting),
        );
        const identity = `${fulfillmentType}:${posting.postingNumber}`;
        if (!seenPostings.has(identity)) {
          seenPostings.add(identity);
          items.push(posting);
        }
      }

      if (!page.hasNext) {
        return items;
      }
      if (!page.cursor) {
        throw new BadRequestException(
          `Ozon ${fulfillmentType} posting pagination returned has_next without a cursor`,
        );
      }
      if (seenCursors.has(page.cursor)) {
        throw new BadRequestException(
          `Ozon ${fulfillmentType} posting pagination returned a repeated cursor`,
        );
      }
      seenCursors.add(page.cursor);
      cursor = page.cursor;
    }
  }

  private async post<T>(
    path: string,
    credentials: OzonCredentials,
    body: Record<string, unknown>,
    options: OzonPostOptions = {},
  ): Promise<T> {
    const baseUrl = this.configService
      .get<string>('OZON_API_BASE_URL', 'https://api-seller.ozon.ru')
      .replace(/\/+$/, '');
    let rateLimitRetries = 0;

    while (true) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {
            'Client-Id': credentials.clientId,
            'Api-Key': credentials.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (error) {
        throw new ServiceUnavailableException(
          `Ozon Seller API is unavailable: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      const text = await response.text();
      let parsed: unknown = {};
      try {
        parsed = text ? (JSON.parse(text) as unknown) : {};
      } catch {
        parsed = { message: text.slice(0, 500) };
      }
      if (!response.ok) {
        const details = this.safeErrorBody(parsed);
        if (
          response.status === 429 &&
          options.retryRateLimit &&
          rateLimitRetries < OZON_RATE_LIMIT_RETRIES
        ) {
          const delayMs = this.rateLimitDelayMs(response, rateLimitRetries);
          rateLimitRetries += 1;
          await this.delay(delayMs);
          continue;
        }
        if (
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500
        ) {
          throw new ServiceUnavailableException({
            message: `Ozon Seller API is temporarily unavailable (${response.status})`,
            details,
          });
        }
        throw new BadRequestException({
          message: `Ozon Seller API rejected request (${response.status})`,
          details,
        });
      }
      return parsed as T;
    }
  }

  private mapProductInfo(item: Record<string, unknown>): OzonProductInfo {
    return {
      productId: this.asNumber(item.id ?? item.product_id),
      offerId: this.asOptionalString(item.offer_id),
      name: this.asOptionalString(item.name),
      price: this.asOptionalString(item.price),
      currencyCode:
        this.asOptionalString(item.currency_code) ??
        this.asOptionalString(item.currencyCode),
      images: this.asStringArray(item.images),
      status: this.asOptionalString(this.asRecord(item.status).state_name),
      raw: item,
    };
  }

  private extractPostingPage(
    response: Record<string, unknown>,
  ): OzonPostingPage {
    return {
      postings: this.asArray(response.postings),
      cursor: this.asOptionalString(response.cursor),
      hasNext: response.has_next === true,
    };
  }

  private rateLimitDelayMs(response: Response, retryIndex: number): number {
    const retryAfter = response.headers.get('retry-after')?.trim();
    if (retryAfter) {
      if (/^\d+(?:\.\d+)?$/.test(retryAfter)) {
        return Math.min(
          Math.max(Math.ceil(Number(retryAfter) * 1_000), 0),
          OZON_RATE_LIMIT_MAX_DELAY_MS,
        );
      }
      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) {
        return Math.min(
          Math.max(retryAt - Date.now(), 0),
          OZON_RATE_LIMIT_MAX_DELAY_MS,
        );
      }
    }
    return Math.min(
      OZON_RATE_LIMIT_FALLBACK_MS * 2 ** retryIndex,
      OZON_RATE_LIMIT_MAX_DELAY_MS,
    );
  }

  private async delay(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) return;
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  private mapOrderPosting(
    fulfillmentType: 'FBS' | 'FBO',
    item: Record<string, unknown>,
  ): OzonOrderPosting {
    const products = this.asArray(item.products).map((product) =>
      this.asRecord(product),
    );
    const postingNumber =
      this.asOptionalString(item.posting_number) ??
      this.asOptionalString(item.postingNumber);
    if (!postingNumber) {
      throw new BadRequestException({
        message:
          'Ozon Seller API returned an order posting without posting_number',
        details: { fulfillmentType },
      });
    }

    return {
      fulfillmentType,
      postingNumber,
      orderId: this.asOptionalId(item.order_id ?? item.orderId),
      status:
        this.asOptionalString(item.status) ??
        this.asOptionalString(item.state) ??
        'UNKNOWN',
      orderedAt:
        this.asOptionalString(item.in_process_at) ??
        this.asOptionalString(item.created_at) ??
        this.asOptionalString(item.shipment_date),
      deliveredAt:
        this.asOptionalString(item.delivering_date) ??
        this.asOptionalString(item.delivered_at),
      currencyCode: this.detectCurrencyCode(item, products),
      totalAmount: this.calculatePostingAmount(item, products),
      itemCount: this.calculateItemCount(products),
      raw: item,
    };
  }

  private detectCurrencyCode(
    item: Record<string, unknown>,
    products: Array<Record<string, unknown>>,
  ): string | undefined {
    const direct =
      this.asOptionalString(item.currency_code) ??
      this.asOptionalString(item.currencyCode);
    if (direct) return direct;
    for (const product of products) {
      const currency =
        this.asOptionalString(product.currency_code) ??
        this.asOptionalString(product.currencyCode);
      if (currency) return currency;
    }
    return undefined;
  }

  private calculatePostingAmount(
    item: Record<string, unknown>,
    products: Array<Record<string, unknown>>,
  ): number {
    const direct =
      this.asNumber(item.total_amount) ??
      this.asNumber(item.totalAmount) ??
      this.asNumber(item.price);
    if (direct !== undefined) return direct;

    const productTotal = products.reduce((sum, product) => {
      const price =
        this.asNumber(product.price) ??
        this.asNumber(product.offer_price) ??
        this.asNumber(product.payout);
      const quantity = this.asNumber(product.quantity) ?? 1;
      return price === undefined ? sum : sum + price * quantity;
    }, 0);
    if (productTotal > 0) return Math.round(productTotal * 100) / 100;

    const financialProducts = this.asArray(
      this.asRecord(item.financial_data).products,
    ).map((product) => this.asRecord(product));
    const financialTotal = financialProducts.reduce((sum, product) => {
      const price =
        this.asNumber(product.price) ??
        this.asNumber(product.commission_amount) ??
        this.asNumber(product.payout);
      const quantity = this.asNumber(product.quantity) ?? 1;
      return price === undefined ? sum : sum + price * quantity;
    }, 0);
    return Math.round(financialTotal * 100) / 100;
  }

  private calculateItemCount(products: Array<Record<string, unknown>>): number {
    if (products.length === 0) return 0;
    return products.reduce(
      (sum, product) => sum + (this.asNumber(product.quantity) ?? 1),
      0,
    );
  }

  private safeErrorBody(value: unknown) {
    const body = this.asRecord(value);
    return {
      code: this.asOptionalString(body.code),
      message: this.asOptionalString(body.message),
      details: body.details,
    };
  }

  private toOzonPricePayload(
    item: OzonProductPriceUpdate,
  ): Record<string, unknown> {
    if (!this.hasUsableProductRef(item)) {
      throw new BadRequestException(
        'Ozon price update requires productId or offerId',
      );
    }
    if (!Number.isFinite(item.price) || item.price <= 0) {
      throw new BadRequestException(
        'Ozon price update requires a positive finite price',
      );
    }

    const payload: Record<string, unknown> = {
      price: this.formatPrice(item.price),
    };
    if (typeof item.productId === 'number' && item.productId > 0) {
      payload.product_id = item.productId;
    }
    if (item.offerId) {
      payload.offer_id = item.offerId;
    }
    if (item.currencyCode) {
      payload.currency_code = item.currencyCode;
    }
    return payload;
  }

  private mapPriceUpdateItem(
    item: Record<string, unknown>,
  ): OzonProductPriceUpdateItem {
    return {
      productId: this.asNumber(item.product_id ?? item.productId),
      offerId: this.asOptionalString(item.offer_id ?? item.offerId),
      updated: item.updated === true,
      errors: this.asArray(item.errors).map((error) =>
        this.mapPriceUpdateError(error),
      ),
      raw: item,
    };
  }

  private mapPriceUpdateError(value: unknown): {
    code?: string;
    message: string;
  } {
    if (typeof value === 'string') {
      return { message: value };
    }
    const error = this.asRecord(value);
    return {
      code: this.asOptionalString(error.code),
      message:
        this.asOptionalString(error.message) ??
        this.asOptionalString(error.error) ??
        JSON.stringify(error),
    };
  }

  private toOzonStockPayload(
    item: OzonProductStockUpdate,
  ): Record<string, unknown> {
    if (!this.hasUsableProductRef(item)) {
      throw new BadRequestException(
        'Ozon stock update requires productId or offerId',
      );
    }
    if (!Number.isInteger(item.stock) || item.stock < 0) {
      throw new BadRequestException(
        'Ozon stock update requires a non-negative integer stock',
      );
    }
    if (!Number.isInteger(item.warehouseId) || item.warehouseId <= 0) {
      throw new BadRequestException(
        'Ozon stock update requires a positive warehouseId',
      );
    }

    const payload: Record<string, unknown> = {
      stock: item.stock,
      warehouse_id: item.warehouseId,
    };
    if (typeof item.productId === 'number' && item.productId > 0) {
      payload.product_id = item.productId;
    }
    if (item.offerId) {
      payload.offer_id = item.offerId;
    }
    return payload;
  }

  private toProductImportPayload(
    item: OzonProductImportInput,
  ): Record<string, unknown> {
    if (
      !Number.isInteger(item.descriptionCategoryId) ||
      item.descriptionCategoryId <= 0
    ) {
      throw new BadRequestException(
        'Ozon product import requires descriptionCategoryId',
      );
    }
    if (
      !item.offerId.trim() ||
      !item.name.trim() ||
      item.attributes.length === 0
    ) {
      throw new BadRequestException(
        'Ozon product import requires offerId, name, and at least one attribute',
      );
    }
    if (!Number.isFinite(item.price) || item.price <= 0) {
      throw new BadRequestException(
        'Ozon product import requires a positive price',
      );
    }
    return {
      attributes: item.attributes,
      ...(item.barcode ? { barcode: item.barcode } : {}),
      description_category_id: item.descriptionCategoryId,
      dimension_unit: item.dimensionUnit,
      height: item.height,
      images: item.images,
      name: item.name,
      offer_id: item.offerId,
      ...(item.oldPrice ? { old_price: this.formatPrice(item.oldPrice) } : {}),
      price: this.formatPrice(item.price),
      primary_image: item.images[0],
      vat: item.vat,
      weight: item.weight,
      weight_unit: item.weightUnit,
      width: item.width,
      depth: item.depth,
      ...(item.currencyCode ? { currency_code: item.currencyCode } : {}),
    };
  }

  private mapStockUpdateItem(
    item: Record<string, unknown>,
  ): OzonProductStockUpdateItem {
    const errors = this.asArray(item.errors).map((error) =>
      this.mapPriceUpdateError(error),
    );
    const status = this.asOptionalString(
      item.status ?? item.state ?? item.result,
    )?.toLowerCase();
    return {
      productId: this.asNumber(item.product_id ?? item.productId),
      offerId: this.asOptionalString(item.offer_id ?? item.offerId),
      warehouseId: this.asNumber(item.warehouse_id ?? item.warehouseId),
      updated:
        item.updated === true ||
        item.result === true ||
        status === 'success' ||
        status === 'updated' ||
        status === 'ok' ||
        errors.length === 0,
      errors,
      raw: item,
    };
  }

  private mapProductStockInfos(
    item: Record<string, unknown>,
  ): OzonProductStockInfo[] {
    const productId = this.asNumber(item.product_id ?? item.productId);
    const offerId = this.asOptionalString(item.offer_id ?? item.offerId);
    const stockRows = this.asArray(item.stocks).map((stock) =>
      this.asRecord(stock),
    );
    if (stockRows.length === 0) {
      return [
        {
          productId,
          offerId,
          warehouseId: this.asNumber(item.warehouse_id ?? item.warehouseId),
          stock: this.asNumber(
            item.stock ??
              item.present ??
              item.available_stock_count ??
              item.availableStockCount,
          ),
          raw: item,
        },
      ];
    }

    return stockRows.map((stock) => ({
      productId,
      offerId,
      warehouseId: this.asNumber(stock.warehouse_id ?? stock.warehouseId),
      stock: this.asNumber(
        stock.stock ??
          stock.present ??
          stock.available_stock_count ??
          stock.availableStockCount,
      ),
      raw: { ...item, stock },
    }));
  }

  private formatPrice(value: number): string {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return String(rounded);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0
      ? value
      : undefined;
  }

  private asOptionalId(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    return undefined;
  }

  private asNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : undefined;
  }

  private hasUsableProductRef(item: OzonProductRef): boolean {
    return (
      (typeof item.productId === 'number' && item.productId > 0) ||
      typeof item.offerId === 'string'
    );
  }
}
