import type {
  ConfirmProductLaunchInput,
  OzonPublicationInput,
  ProductPreparationMode,
} from '../api/review';

interface ProductPreparationRequestDraft {
  candidateId: string;
  referenceAssetId: string;
  workspaceId: string;
  preparationMode: ProductPreparationMode;
  economicsEvaluationId?: string | null;
  economicsEvaluationHash?: string | null;
  ozonPublication?: OzonPublicationInput;
}

export function buildProductPreparationRequest(
  draft: ProductPreparationRequestDraft,
): ConfirmProductLaunchInput {
  const request: ConfirmProductLaunchInput = {
    candidateId: draft.candidateId,
    confirmImageGeneration: true,
    referenceAssetId: draft.referenceAssetId,
    workspaceId: draft.workspaceId,
    preparationMode: draft.preparationMode,
  };

  if (draft.preparationMode === 'CREATIVE_ONLY') {
    return request;
  }

  if (!draft.economicsEvaluationId || !draft.economicsEvaluationHash) {
    throw new Error('候选核价与利润评估证明不完整，禁止进入可发布资料流程。');
  }

  return {
    ...request,
    economicsEvaluationId: draft.economicsEvaluationId,
    economicsEvaluationHash: draft.economicsEvaluationHash,
    ...(draft.ozonPublication
      ? { ozonPublication: draft.ozonPublication }
      : {}),
  };
}
