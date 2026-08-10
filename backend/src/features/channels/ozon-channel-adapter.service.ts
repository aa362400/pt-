import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OzonCredentialsService } from './ozon-credentials.service.js';
import {
  OzonSellerApiClient,
  type OzonProductImportInfoResult,
  type OzonProductImportInput,
  type OzonProductImportResult,
  type OzonProductInfo,
  type OzonProductRef,
} from './ozon-seller-api.client.js';

export type OzonChannelFailureCategory =
  | 'CREDENTIALS_INVALID'
  | 'REQUEST_REJECTED'
  | 'TEMPORARILY_UNAVAILABLE'
  | 'UNEXPECTED_ADAPTER_FAILURE';

export class OzonChannelAdapterError extends Error {
  constructor(
    readonly category: OzonChannelFailureCategory,
    readonly operation: string,
    readonly retryable: boolean,
    readonly outcomeUnknown: boolean,
    readonly originalError: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'OzonChannelAdapterError';
  }
}

export interface OzonProductChannelSession {
  getProductInfoList(refs: OzonProductRef[]): Promise<OzonProductInfo[]>;
  importProducts(
    items: OzonProductImportInput[],
  ): Promise<OzonProductImportResult>;
  getProductImportInfo(taskId: number): Promise<OzonProductImportInfoResult>;
}

/**
 * Ozon protocol boundary. It resolves credentials, calls Seller API methods,
 * and translates transport failures without deciding whether a product may be
 * published. Business policy remains outside this adapter.
 */
@Injectable()
export class OzonChannelAdapter {
  constructor(
    private readonly credentials: OzonCredentialsService,
    private readonly client: OzonSellerApiClient,
  ) {}

  async open(accessTokenEncrypted: string): Promise<OzonProductChannelSession> {
    let credentials;
    try {
      credentials = await this.credentials.decode(accessTokenEncrypted);
    } catch (error) {
      throw new OzonChannelAdapterError(
        'CREDENTIALS_INVALID',
        'OPEN_SESSION',
        false,
        false,
        error,
        'Ozon 店铺凭据不可用，请重新验证店铺连接。',
      );
    }

    return {
      getProductInfoList: (refs) =>
        this.call('PRODUCT_INFO_READ', false, () =>
          this.client.getProductInfoList(credentials, refs),
        ),
      importProducts: (items) =>
        this.call('PRODUCT_IMPORT', true, () =>
          this.client.importProducts(credentials, items),
        ),
      getProductImportInfo: (taskId) =>
        this.call('PRODUCT_IMPORT_INFO_READ', false, () =>
          this.client.getProductImportInfo(credentials, taskId),
        ),
    };
  }

  private async call<T>(
    operation: string,
    mutating: boolean,
    invoke: () => Promise<T>,
  ): Promise<T> {
    try {
      return await invoke();
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new OzonChannelAdapterError(
          'REQUEST_REJECTED',
          operation,
          false,
          false,
          error,
          this.errorMessage(error),
        );
      }
      if (error instanceof ServiceUnavailableException) {
        throw new OzonChannelAdapterError(
          'TEMPORARILY_UNAVAILABLE',
          operation,
          true,
          mutating,
          error,
          'Ozon 暂时不可用，当前写入结果无法确认。',
        );
      }
      throw new OzonChannelAdapterError(
        'UNEXPECTED_ADAPTER_FAILURE',
        operation,
        false,
        mutating,
        error,
        'Ozon 通道调用失败，系统未把该动作标记为成功。',
      );
    }
  }

  private errorMessage(error: BadRequestException): string {
    const response = error.getResponse();
    if (typeof response === 'string' && response.trim()) return response;
    if (response && typeof response === 'object') {
      const message = (response as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
    }
    return error.message;
  }
}
