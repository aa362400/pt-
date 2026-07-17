import { derivePipelineStage } from '../src/features/dashboard/pipeline-stage.js';

describe('derivePipelineStage', () => {
  it.each([
    [
      { kind: 'RESEARCH_RUN', status: 'RUNNING', errorCode: null },
      { stage: 'RESEARCH', blockedOn: null, errorCode: null },
    ],
    [
      { kind: 'RESEARCH_RUN', status: 'PARTIAL', errorCode: 'EVIDENCE_INSUFFICIENT' },
      { stage: 'EVIDENCE_REVIEW', blockedOn: '补充独立需求证据', errorCode: 'EVIDENCE_INSUFFICIENT' },
    ],
    [
      { kind: 'REVIEW_TASK', status: 'PENDING', errorCode: null },
      { stage: 'APPROVAL', blockedOn: '等待人工审批', errorCode: null },
    ],
    [
      { kind: 'PRODUCT_LAUNCH', status: 'GENERATING_IMAGES', errorCode: null },
      { stage: 'CONTENT_GENERATION', blockedOn: null, errorCode: null },
    ],
    [
      { kind: 'PRODUCT_LAUNCH', status: 'AWAITING_PUBLISH_APPROVAL', errorCode: null },
      { stage: 'PUBLISH_SNAPSHOT', blockedOn: '等待发布审批', errorCode: null },
    ],
    [
      { kind: 'PRODUCT_LAUNCH', status: 'SUBMITTING_TO_OZON', errorCode: null },
      { stage: 'PUBLISHING', blockedOn: null, errorCode: null },
    ],
    [
      { kind: 'PRODUCT_LAUNCH', status: 'ACTIVE_ON_OZON', errorCode: null },
      { stage: 'MONITORING', blockedOn: null, errorCode: null },
    ],
    [
      { kind: 'PRODUCT_LAUNCH', status: 'FAILED', errorCode: 'OZON_WRITE_FAILED', hasSnapshot: true },
      { stage: 'PUBLISHING', blockedOn: '发布失败，等待安全重试或人工处理', errorCode: 'OZON_WRITE_FAILED' },
    ],
  ] as const)('derives %# without inventing progress', (input, expected) => {
    expect(derivePipelineStage(input)).toEqual(expected);
  });
});
