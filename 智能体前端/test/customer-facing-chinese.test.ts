import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  agentTypeLabel,
  customerApiErrorMessage,
  customerErrorPresentation,
  executionStatusLabel,
} from '../src/utils/customer-facing-language.ts';
import { routeTitleForPath } from '../src/lib/navigation.ts';

const readSource = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

test('shared navigation uses Chinese-first customer labels for technical modules', () => {
  const navigationSource = readSource('../src/lib/navigation.ts');

  assert.match(navigationSource, /智能体质量/);
  assert.match(navigationSource, /智能体执行台/);
  assert.match(navigationSource, /工具接入（MCP）/);
  assert.match(navigationSource, /商品刊登与搜索优化（SEO）/);
  assert.doesNotMatch(navigationSource, /label: ['"](?:AI )?Agent/);
});

test('topbar has a Chinese title for every customer-accessible operations route', () => {
  assert.equal(routeTitleForPath('/orders/operations'), '订单同步与诊断');
  assert.equal(routeTitleForPath('/trend-radar'), '趋势洞察');
  assert.equal(routeTitleForPath('/profit-calculator'), '利润计算');
  assert.equal(routeTitleForPath('/keyword-analysis'), '关键词分析');
  assert.equal(routeTitleForPath('/market/operations'), 'Ozon 业务分析');
  assert.equal(routeTitleForPath('/not-a-real-route'), null);
});

test('customer status presentation never exposes raw execution codes', () => {
  assert.equal(executionStatusLabel('PENDING'), '等待处理');
  assert.equal(executionStatusLabel('RUNNING'), '执行中');
  assert.equal(executionStatusLabel('COMPLETED'), '已完成');
  assert.equal(executionStatusLabel('FAILED'), '执行失败');
  assert.equal(executionStatusLabel('DISCONNECTED'), '未连接');
  assert.equal(executionStatusLabel('UNRECOGNIZED_BACKEND_CODE'), '状态待核实');
});

test('customer agent type presentation uses Chinese names and a safe fallback', () => {
  assert.equal(agentTypeLabel('GENERAL_ASSISTANT'), '通用运营智能体');
  assert.equal(agentTypeLabel('PRODUCT_RESEARCH'), '选品智能体');
  assert.equal(agentTypeLabel('UNRECOGNIZED_AGENT'), '业务智能体');
});

test('API error presentation preserves Chinese details but masks English and raw codes', () => {
  assert.equal(customerApiErrorMessage('库存不足，请补充库存。', 409), '库存不足，请补充库存。');
  assert.equal(customerApiErrorMessage('LISTING_SANDBOX_BLOCKED', 409), '请求未通过业务校验，请按页面提示检查后重试。');
  assert.equal(customerApiErrorMessage('Internal Server Error', 500), '服务暂时不可用，请稍后重试。');
  assert.equal(customerApiErrorMessage('', 403), '当前账号无权执行此操作。');
});

test('stable Agent errors have Chinese title, reason and recovery action', () => {
  assert.deepEqual(customerErrorPresentation('MODEL_PROVIDER_UNAVAILABLE'), {
    title: '大模型服务暂不可用',
    reason: '当前已授权的大模型供应商无法完成请求。',
    action: '请稍后重试，或由管理员检查模型通道配置。',
    diagnosticCode: 'MODEL_PROVIDER_UNAVAILABLE',
  });
  assert.deepEqual(customerErrorPresentation('IMAGE_PROVIDER_INVALID_KEY'), {
    title: '图片服务密钥无效',
    reason: '图片生成供应商拒绝了当前密钥。',
    action: '请管理员更新图片服务密钥后重新执行。',
    diagnosticCode: 'IMAGE_PROVIDER_INVALID_KEY',
  });
  assert.equal(
    customerErrorPresentation('UNKNOWN_NEW_CODE').reason,
    '系统尚未识别该错误类型，诊断代码：UNKNOWN_NEW_CODE。',
  );
  assert.equal(
    customerErrorPresentation('UNKNOWN_NEW_CODE', 'Error: secret\n at stack').reason,
    '系统尚未识别该错误类型，诊断代码：UNKNOWN_NEW_CODE。',
  );
});

test('high-frequency dashboards render localized labels instead of raw backend codes', () => {
  const dashboardSource = readSource('../src/pages/Dashboard.tsx');
  const mcpSource = readSource('../src/pages/McpToolConsole.tsx');
  const healthSource = readSource('../src/components/ops/SystemHealthOverview.tsx');

  assert.match(dashboardSource, /executionStatusLabel\(status\)/);
  assert.match(dashboardSource, /agentTypeLabel\(item\.agentType\)/);
  assert.match(dashboardSource, /executionStatusLabel\(ozon\.syncStatus\)/);
  assert.doesNotMatch(mcpSource, />\{run\.status\}</);
  assert.match(mcpSource, /executionStatusLabel\(run\.status\)/);
  assert.doesNotMatch(healthSource, />\{run\.status\}</);
  assert.match(healthSource, /executionStatusLabel\(run\.status\)/);
});

test('stream fallbacks shown to customers are Chinese', () => {
  const agentStreamSource = readSource('../src/api/sse.ts');
  const notificationStreamSource = readSource('../src/api/notifications.ts');

  assert.doesNotMatch(agentStreamSource, /Task failed|SSE connection failed/);
  assert.doesNotMatch(notificationStreamSource, /Notification stream (?:failed|closed)/);
  assert.match(agentStreamSource, /任务执行失败/);
  assert.match(notificationStreamSource, /通知实时连接/);
});

test('customer-facing route headings explain technical terms in Chinese first', () => {
  const listingSource = readSource('../src/pages-v2/ListingOverviewV2.tsx');
  const capabilitySource = readSource('../src/pages/CapabilityCenter.tsx');
  const zhLocaleSource = readSource('../src/i18n/locales/zh-CN.json');
  const agentConsoleSource = readSource('../src/pages/AgentConsole.tsx');
  const qualitySource = readSource('../src/pages/AgentQualityCenter.tsx');

  assert.match(listingSource, /商品刊登与搜索优化（SEO）/);
  assert.doesNotMatch(listingSource, />刊登与 SEO</);
  assert.match(capabilitySource, /capabilityCenter\.description/);
  assert.match(zhLocaleSource, /此页面用于系统诊断与功能接入管理/);
  assert.doesNotMatch(capabilitySource, /贯通/u);
  assert.doesNotMatch(capabilitySource, />Agent</);
  assert.match(agentConsoleSource, />智能体执行台</);
  assert.doesNotMatch(agentConsoleSource, /还没有 Agent 会话/);
  assert.match(qualitySource, />智能体质量中心</);
  assert.doesNotMatch(qualitySource, /Run ID|Listing ID|暂无 Prompt 版本/);
});

test('customer pages do not render known raw backend status fields', () => {
  const marketingSource = readSource('../src/pages-v2/MarketingOverviewV2.tsx');
  const billingSource = readSource('../src/pages/BillingPage.tsx');
  const teamSource = readSource('../src/pages/TeamCollaboration.tsx');

  assert.doesNotMatch(marketingSource, />\{campaign\.state\}</);
  assert.match(marketingSource, /executionStatusLabel\(campaign\.state\)/);
  assert.doesNotMatch(billingSource, />\{inv\.status\}</);
  assert.match(billingSource, /executionStatusLabel\(inv\.status\)/);
  assert.doesNotMatch(teamSource, />\{sop\.status\}</);
  assert.match(teamSource, /executionStatusLabel\(sop\.status\)/);
});

test('secondary customer routes avoid untranslated operational jargon', () => {
  const enterpriseTeamSource = readSource('../src/pages/EnterpriseTeam.tsx');
  const keywordSource = readSource('../src/pages/KeywordAnalysis.tsx');
  const ordersSource = readSource('../src/pages/OrdersSync.tsx');
  const roadmapSource = readSource('../src/pages/AgentRoadmap.tsx');
  const mcpSource = readSource('../src/pages/McpToolConsole.tsx');

  assert.doesNotMatch(enterpriseTeamSource, />[^<{]*(?:Agent|Skill|Connector)[^<{]*</);
  assert.match(enterpriseTeamSource, /executionStatusLabel\(run\.status\)/);
  assert.doesNotMatch(keywordSource, />指标：DATA_INSUFFICIENT</);
  assert.doesNotMatch(ordersSource, />Posting</);
  assert.doesNotMatch(roadmapSource, />[^<{]*Listing 草稿</);
  assert.doesNotMatch(mcpSource, />Action</);
});

test('operations and image routes localize order, connection and task statuses', () => {
  const businessSource = readSource('../src/pages/OzonBusinessIntelligence.tsx');
  const ordersSource = readSource('../src/pages/OrdersSync.tsx');
  const imageSource = readSource('../src/pages/ImageWorkbench.tsx');
  const memorySource = readSource('../src/pages/MemoryGovernance.tsx');

  assert.match(businessSource, /marketplaceOrderStatusLabel\(order\.status\)/);
  assert.match(businessSource, /executionStatusLabel\(activeChannel\?\.syncStatus\)/);
  assert.match(ordersSource, /marketplaceOrderStatusLabel\(order\.status\)/);
  assert.match(ordersSource, /fulfillmentTypeLabel\(order\.fulfillmentType\)/);
  assert.match(imageSource, /executionStatusLabel\(run\?\.status/);
  assert.doesNotMatch(memorySource, /item\.status \?\? "-"/);
  assert.match(memorySource, /executionStatusLabel\(item\.status\)/);
});

test('Chinese locale and login use the customer-facing GlobalPilot name and Chinese listing terms', () => {
  const locale = JSON.parse(readSource('../src/i18n/locales/zh-CN.json')) as Record<string, any>;
  const loginSource = readSource('../src/pages/Login.tsx');

  assert.equal(locale.topbar.pageTitleDefault, 'GlobalPilot AI');
  assert.equal(locale.auth.loginTitle, '登录 GlobalPilot AI');
  assert.equal(locale.nav.listingGenerator, '商品刊登生成');
  assert.equal(locale.listingGenerator.title, '商品刊登生成中心');
  assert.equal(locale.listingGenerator.seoTags, '搜索优化标签');
  assert.equal(locale.listingGenerator.unnamedListing, '未命名商品刊登');
  assert.match(loginSource, />GlobalPilot AI</);
  assert.doesNotMatch(loginSource, /ShopMate AI/);
});
