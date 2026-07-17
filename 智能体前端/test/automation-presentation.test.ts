import assert from 'node:assert/strict';
import test from 'node:test';

import {
  automationActionLabel,
  automationBackendStatusLabel,
  automationCardStatus,
  automationEnableBlockReason,
  automationExecutionBlockReason,
  automationFlowText,
  automationProviderLabel,
  automationRunBlockReason,
  automationRunSourceLabel,
  automationRunStatusLabel,
  automationTriggerLabel,
} from '../src/utils/automation-presentation.ts';

test('known backend-created English templates have deterministic Chinese presentation', () => {
  assert.deepEqual(
    automationFlowText({
      source: 'agent_suggestion',
      name: '[Agent scheduled] Roadmap acceptance launch package',
      description: 'Acceptance evidence for proactive suggestion and scheduling.',
    }),
    {
      name: '[智能体排程] 上架准备验收流程',
      description: '用于验证智能体主动建议与自动排程的验收证据。',
    },
  );

  assert.deepEqual(
    automationFlowText({
      source: 'operator',
      name: '[Operator] Prepare 1 products for launch',
      description:
        'Roadmap acceptance: prepare research, listing, images, margin, review, and keep publish pending confirmation.',
    }),
    {
      name: '[操作员] 准备 1 个商品上架',
      description:
        '路线图验收流程：依次准备选品调研、刊登草稿、商品图片、利润核算和人工审核；发布继续等待人工确认。',
    },
  );
});

test('customer-authored names and descriptions are never translated or rewritten', () => {
  const customerFlow = {
    source: 'automation_v2_ui',
    name: '[Operator] Prepare 1 products for launch',
    description:
      'Roadmap acceptance: prepare research, listing, images, margin, review, and keep publish pending confirmation.',
  };

  assert.deepEqual(automationFlowText(customerFlow), {
    name: customerFlow.name,
    description: customerFlow.description,
  });
  assert.deepEqual(
    automationFlowText({
      source: 'automation_v2_ui',
      name: '客户自定义补货流程',
      description: '保留客户自己填写的原文与大小写。',
    }),
    {
      name: '客户自定义补货流程',
      description: '保留客户自己填写的原文与大小写。',
    },
  );
});

test('backend operator template localizes its generated count but preserves a custom instruction', () => {
  assert.deepEqual(
    automationFlowText({
      source: 'operator',
      name: '[Operator] Prepare 12 products for launch',
      description: 'Keep this operator instruction exactly as written.',
    }),
    {
      name: '[操作员] 准备 12 个商品上架',
      description: 'Keep this operator instruction exactly as written.',
    },
  );
});

test('all known automation system codes have exact Chinese labels', () => {
  assert.equal(automationBackendStatusLabel('DRAFT'), '草稿');
  assert.equal(automationBackendStatusLabel('ACTIVE'), '已启用');
  assert.equal(automationBackendStatusLabel('PAUSED'), '已暂停');
  assert.equal(automationBackendStatusLabel('ERROR'), '执行失败');
  assert.equal(automationBackendStatusLabel('ARCHIVED'), '已归档');
  assert.equal(automationTriggerLabel('MANUAL'), '手动运行');
  assert.equal(automationTriggerLabel('SCHEDULE'), '自动排期');
  assert.equal(automationTriggerLabel('WEBHOOK'), '外部通知触发');
  assert.equal(automationTriggerLabel('CONDITION'), '条件触发');
  assert.equal(automationTriggerLabel('EVENT'), '业务事件触发');
  assert.equal(automationActionLabel('product.research'), '真实选品调研');
  assert.equal(automationActionLabel('image.generate'), '生成商品图片');
  assert.equal(automationActionLabel('listing.publish'), '等待人工确认发布');
  assert.equal(automationRunStatusLabel('PENDING'), '等待执行');
  assert.equal(automationRunStatusLabel('RUNNING'), '执行中');
  assert.equal(automationRunStatusLabel('COMPLETED'), '已完成');
  assert.equal(automationRunStatusLabel('PARTIAL'), '部分完成');
  assert.equal(automationRunStatusLabel('FAILED'), '执行失败');
  assert.equal(automationRunSourceLabel('manual'), '人工发起');
  assert.equal(automationRunSourceLabel('schedule'), '定时计划');
  assert.equal(automationProviderLabel('OZON'), 'Ozon');
});

test('missing and unknown system codes never leak raw backend codes to customers', () => {
  assert.equal(automationBackendStatusLabel(null), '状态未提供');
  assert.equal(automationBackendStatusLabel('NEW_STATE'), '状态未知');
  assert.equal(automationTriggerLabel(null), '触发方式未提供');
  assert.equal(automationTriggerLabel('INTERNAL_CODE'), '未知触发方式');
  assert.equal(automationActionLabel(null), '步骤未提供');
  assert.equal(automationActionLabel('private.action.v2'), '未知步骤');
  assert.equal(automationRunStatusLabel(null), '运行状态未提供');
  assert.equal(automationRunStatusLabel('REQUEUED'), '运行状态未知');
  assert.equal(automationRunSourceLabel(null), '来源未提供');
  assert.equal(automationRunSourceLabel('internal_replay_v2'), '未知来源');
  assert.equal(automationProviderLabel(null), '数据来源未提供');
  assert.equal(automationProviderLabel('PRIVATE_PROVIDER'), '未知数据来源');
});

test('card status distinguishes archived and unknown backend states', () => {
  assert.equal(automationCardStatus('DRAFT', null), 'draft');
  assert.equal(automationCardStatus('ACTIVE', null), 'active');
  assert.equal(automationCardStatus('PAUSED', null), 'paused');
  assert.equal(automationCardStatus('ERROR', null), 'error');
  assert.equal(automationCardStatus('ARCHIVED', null), 'archived');
  assert.equal(automationCardStatus('FUTURE_STATE', null), 'unknown');
  assert.equal(automationCardStatus('ACTIVE', 'FAILED'), 'error');
});

test('unsupported or incomplete configurations return a Chinese blocking reason', () => {
  assert.equal(
    automationExecutionBlockReason({
      triggerType: 'MANUAL',
      steps: [{ action: 'image.generate' }],
    }),
    '步骤“生成商品图片”尚未接入当前页面可验证的执行器。',
  );
  assert.equal(
    automationExecutionBlockReason({
      triggerType: 'MANUAL',
      steps: [{ action: 'private.action.v2' }],
    }),
    '步骤“未知步骤”尚未接入当前页面可验证的执行器。',
  );
  assert.equal(
    automationExecutionBlockReason({ triggerType: 'MANUAL', steps: [] }),
    '该流程没有执行步骤。',
  );
  assert.equal(
    automationExecutionBlockReason({
      triggerType: 'WEBHOOK',
      steps: [{ action: 'task.create' }],
    }),
    '当前页面尚未配置这种触发方式。',
  );
  assert.equal(
    automationExecutionBlockReason({
      triggerType: 'MANUAL',
      steps: [{ action: 'listing.draft' }],
    }),
    '刊登草稿步骤必须绑定一个工作区。',
  );
  assert.equal(
    automationExecutionBlockReason({
      triggerType: 'MANUAL',
      workspaceId: 'workspace-1',
      steps: [{ action: 'listing.draft' }],
    }),
    null,
  );
});

test('scheduled-flow activation accepts the schedule formats used by the real backend', () => {
  const step = [{ action: 'task.create' }];
  assert.equal(
    automationEnableBlockReason({
      triggerType: 'SCHEDULE',
      triggerConfig: { dailyAt: '08:00', timezone: 'Asia/Shanghai' },
      steps: step,
    }),
    null,
  );
  assert.equal(
    automationEnableBlockReason({
      triggerType: 'SCHEDULE',
      triggerConfig: { intervalMinutes: 240 },
      steps: step,
    }),
    null,
  );
  assert.equal(
    automationEnableBlockReason({
      triggerType: 'SCHEDULE',
      triggerConfig: { dueAt: '2026-07-18T00:00:00.000Z' },
      steps: step,
    }),
    null,
  );
  assert.equal(
    automationEnableBlockReason({
      triggerType: 'SCHEDULE',
      triggerConfig: {},
      steps: step,
    }),
    '自动排期流程未提供有效的运行时间或执行间隔。',
  );
  assert.equal(
    automationEnableBlockReason({
      triggerType: 'SCHEDULE',
      triggerConfig: { intervalMinutes: 2 },
      steps: step,
    }),
    '自动排期流程的执行间隔不能少于 5 分钟。',
  );
  assert.equal(
    automationEnableBlockReason({
      triggerType: 'SCHEDULE',
      triggerConfig: { intervalMinutes: 240, retiredAt: '2026-07-09T00:00:00Z' },
      steps: step,
    }),
    '该历史流程已停用，不能重新启用。',
  );
});

test('manual run validation does not reject an active daily schedule', () => {
  assert.equal(
    automationRunBlockReason({
      backendStatus: 'ACTIVE',
      latestRunStatus: null,
      latestRunId: null,
      triggerType: 'SCHEDULE',
      triggerConfig: { dailyAt: '08:00', timezone: 'Asia/Shanghai' },
      steps: [{ action: 'task.create' }],
    }),
    null,
  );
});

test('run buttons are blocked before asking customers to complete an impossible action', () => {
  assert.equal(
    automationRunBlockReason({
      backendStatus: 'PAUSED',
      latestRunStatus: null,
      latestRunId: null,
      triggerType: 'MANUAL',
      steps: [{ action: 'task.create' }],
    }),
    '流程未启用，请先启用。',
  );
  assert.equal(
    automationRunBlockReason({
      backendStatus: 'ERROR',
      latestRunStatus: 'FAILED',
      latestRunId: null,
      triggerType: 'MANUAL',
      steps: [{ action: 'task.create' }],
    }),
    '后端未提供可恢复的失败运行编号。',
  );
  assert.equal(
    automationRunBlockReason({
      backendStatus: 'ACTIVE',
      latestRunStatus: null,
      latestRunId: null,
      triggerType: 'MANUAL',
      steps: [{ action: 'task.create' }],
    }),
    null,
  );
});
