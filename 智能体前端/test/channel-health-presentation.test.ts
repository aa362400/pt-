import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiChannelLabel,
  aiChannelStatusLabel,
  channelPreflightWarnings,
} from '../src/utils/channel-health-presentation.ts';

const snapshot = {
  agentConnection: 'connected' as const,
  overall: 'degraded' as const,
  checkedAt: '2026-07-17T00:00:00Z',
  cacheTtlSeconds: 300,
  errorCode: null,
  llm: { status: 'available' as const, provider: 'openai-compatible', errorCode: null, message: null, latencyMs: 20 },
  image: { status: 'unavailable' as const, provider: null, errorCode: 'IMAGE_PROVIDER_INVALID_KEY', message: null, latencyMs: 30 },
  search: { status: 'quota_exhausted' as const, provider: 'serper', errorCode: 'SEARCH_PROVIDER_QUOTA_EXHAUSTED', message: null, latencyMs: 40 },
};

test('AI channel presentation is Chinese-first', () => {
  assert.equal(aiChannelLabel('llm'), '大模型');
  assert.equal(aiChannelLabel('image'), '图片生成');
  assert.equal(aiChannelLabel('search'), '联网搜索');
  assert.equal(aiChannelStatusLabel('available'), '可用');
  assert.equal(aiChannelStatusLabel('quota_exhausted'), '额度不足');
  assert.equal(aiChannelStatusLabel('unknown'), '尚未确认');
});

test('preflight warnings explain impact but do not decide whether an action is disabled', () => {
  assert.deepEqual(channelPreflightWarnings(snapshot, ['llm', 'search']), [
    '联网搜索通道额度不足，本次任务可能只能保留已有证据或部分完成。',
  ]);
  assert.deepEqual(channelPreflightWarnings(snapshot, ['image']), [
    '图片生成通道不可用，本次任务可能无法生成商品图片。',
  ]);
});

test('agent-down warning does not invent individual provider state', () => {
  assert.deepEqual(
    channelPreflightWarnings(
      {
        ...snapshot,
        agentConnection: 'unavailable',
        errorCode: 'AGENT_RUNTIME_UNAVAILABLE',
      },
      ['llm', 'image'],
    ),
    ['Python 智能体当前不可连接，启动后可能立即失败；可先刷新通道状态。'],
  );
});
