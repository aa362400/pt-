import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildProductPreparationRequest } from '../src/utils/product-preparation.ts';

const apiSource = readFileSync(
  new URL('../src/api/review.ts', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL(
    '../src/components/review/ProductResearchLaunchPanel.tsx',
    import.meta.url,
  ),
  'utf8',
);
const approvalSource = readFileSync(
  new URL('../src/pages-v2/ApprovalCenterV2.tsx', import.meta.url),
  'utf8',
);

test('仅本地创意请求固定绑定工作区且不会携带核价或 Ozon 发布字段', () => {
  const request = buildProductPreparationRequest({
    candidateId: 'candidate-1',
    referenceAssetId: 'asset-1',
    workspaceId: 'workspace-1',
    preparationMode: 'CREATIVE_ONLY',
    economicsEvaluationId: 'evaluation-must-not-leak',
    economicsEvaluationHash: 'hash-must-not-leak',
    ozonPublication: { offerId: 'must-not-leak' },
  });

  assert.deepEqual(request, {
    candidateId: 'candidate-1',
    confirmImageGeneration: true,
    referenceAssetId: 'asset-1',
    workspaceId: 'workspace-1',
    preparationMode: 'CREATIVE_ONLY',
  });
});

test('可发布资料模式缺少完整核价证明时失败关闭', () => {
  assert.throws(
    () => buildProductPreparationRequest({
      candidateId: 'candidate-1',
      referenceAssetId: 'asset-1',
      workspaceId: 'workspace-1',
      preparationMode: 'PUBLISH_READY',
      economicsEvaluationId: 'evaluation-1',
    }),
    /核价与利润评估证明不完整/,
  );
});

test('审批页支持未核价本地生成、安全重试和中文状态，但不放宽发布门禁', () => {
  assert.match(apiSource, /'CREATIVE_ONLY' \| 'PUBLISH_READY'/);
  assert.match(apiSource, /'AWAITING_ECONOMICS_REVIEW'/);
  assert.match(apiSource, /workspaceId: string/);
  assert.match(panelSource, /candidate\.evidenceReady === true \|\| creativeOnlySafetyReady/);
  assert.match(panelSource, /signalSources\.size >= 2/);
  assert.match(panelSource, /candidate\.launch\?\.status === 'FAILED'/);
  assert.match(panelSource, /candidate\.launch\?\.status === 'BLOCKED'/);
  assert.match(panelSource, /workspace\.channelType === 'OZON' && workspace\.status === 'ACTIVE'/);
  assert.match(panelSource, /purpose: 'PRODUCT_IMAGE',[\s\S]{0,100}workspaceId/);
  assert.match(panelSource, /确认生成本地图片和中文商品资料（不发布）/);
  assert.match(panelSource, /图片和商品资料已生成 · 等待人工核价/);
  assert.match(panelSource, /不会生成发布审批、不会创建发布快照，也不会调用 Ozon 上架接口/);
  assert.match(approvalSource, /input\.preparationMode === 'CREATIVE_ONLY'/);
  assert.match(approvalSource, /仍待人工核价，不能发布/);
  assert.match(approvalSource, /dailyCandidateSafety=\{selectedTask\.dailyProductResearchPreview\}/);
});
