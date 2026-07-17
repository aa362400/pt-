export interface NavigationItem {
  label: string;
  path: string;
}

export type NavigationGroupId =
  | 'workbench'
  | 'selection'
  | 'listing'
  | 'operations'
  | 'settings';

export interface NavigationGroup {
  id: NavigationGroupId;
  label: string;
  defaultCollapsed?: boolean;
  items: NavigationItem[];
}

export const navigationGroups: NavigationGroup[] = [
  {
    id: 'workbench',
    label: '工作台',
    items: [
      { label: '工作台', path: '/workbench' },
      { label: '运营总览', path: '/assistant' },
    ],
  },
  {
    id: 'selection',
    label: '选品',
    items: [{ label: '每日精准选品', path: '/daily-product-research' }],
  },
  {
    id: 'listing',
    label: '上架与审核',
    items: [
      { label: '审批中心', path: '/review' },
      { label: '商品刊登与搜索优化（SEO）', path: '/listing-generator' },
      { label: '内容与图片', path: '/image-prompt' },
      { label: 'Ozon 核价', path: '/ozon-pricing' },
    ],
  },
  {
    id: 'operations',
    label: '店铺运营',
    items: [
      { label: '商品管理', path: '/products' },
      { label: '订单管理', path: '/orders' },
      { label: '营销广告', path: '/marketing' },
      { label: '客户服务', path: '/customer-service' },
      { label: '自动化流程', path: '/automation' },
      { label: '数据分析', path: '/market' },
      { label: 'Ozon 竞争监控', path: '/competition' },
      { label: '供应链中心', path: '/supply-chain' },
    ],
  },
  {
    id: 'settings',
    label: '设置与管理',
    defaultCollapsed: true,
    items: [
      { label: '平台连接', path: '/store-monitor' },
      { label: '团队与设置', path: '/team' },
      { label: '账单与套餐', path: '/billing' },
      { label: '功能操作中心', path: '/operations-center' },
      { label: '工具接入（MCP）', path: '/mcp-tools' },
      { label: '审计日志', path: '/audit-logs' },
      { label: '智能体质量', path: '/agent-quality' },
      { label: '企业验收', path: '/enterprise-readiness' },
      { label: '记忆治理', path: '/memory-governance' },
      { label: 'AI 运营团队', path: '/enterprise-team' },
      { label: '智能体执行台', path: '/agent-console' },
      { label: '智能体中心', path: '/agent-roadmap' },
    ],
  },
];

export const navigationItems: NavigationItem[] = navigationGroups.flatMap(
  (group) => group.items,
);

const secondaryRouteTitles: NavigationItem[] = [
  { label: '团队协作', path: '/team/operations' },
  { label: '订单同步与诊断', path: '/orders/operations' },
  { label: '趋势洞察', path: '/trend-radar' },
  { label: '商品调研', path: '/product-research' },
  { label: 'Ozon 公开选品', path: '/ozon-observations' },
  { label: '利润计算', path: '/profit-calculator' },
  { label: '关键词分析', path: '/keyword-analysis' },
  { label: '客户服务业务接入', path: '/customer-service/operations' },
  { label: '智能体路线图', path: '/agent-roadmap/operations' },
  { label: 'Ozon 业务分析', path: '/market/operations' },
  { label: '机会分析', path: '/opportunity' },
  { label: '热门商品', path: '/hot-products' },
];

const routeCatalog = [...navigationItems, ...secondaryRouteTitles];

export function routeTitleForPath(pathname: string): string | null {
  return routeCatalog
    .filter(
      (item) =>
        pathname === item.path ||
        (item.path !== '/assistant' && pathname.startsWith(`${item.path}/`)),
    )
    .sort((left, right) => right.path.length - left.path.length)[0]?.label ?? null;
}

export const navigationLabelForPath = routeTitleForPath;

export function searchNavigation(query: string): NavigationItem[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalizedQuery) return [];

  return routeCatalog.filter((item) =>
    `${item.label} ${item.path}`
      .toLocaleLowerCase('zh-CN')
      .includes(normalizedQuery),
  );
}
