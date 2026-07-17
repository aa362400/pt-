export interface NavigationItem {
  label: string;
  path: string;
}

export const navigationItems: NavigationItem[] = [
  { label: '企业验收', path: '/enterprise-readiness' },
  { label: '工具接入（MCP）', path: '/mcp-tools' },
  { label: '记忆治理', path: '/memory-governance' },
  { label: '审计日志', path: '/audit-logs' },
  { label: '智能体质量', path: '/agent-quality' },
  { label: '运营总览', path: '/assistant' },
  { label: '智能体执行台', path: '/agent-console' },
  { label: '智能体中心', path: '/agent-roadmap' },
  { label: 'AI 运营团队', path: '/enterprise-team' },
  { label: '功能操作中心', path: '/operations-center' },
  { label: '每日精准选品', path: '/daily-product-research' },
  { label: 'Ozon 公开选品', path: '/ozon-observations' },
  { label: '商品管理', path: '/products' },
  { label: 'Ozon 核价', path: '/ozon-pricing' },
  { label: '供应链中心', path: '/supply-chain' },
  { label: '商品刊登与搜索优化（SEO）', path: '/listing-generator' },
  { label: '内容与图片', path: '/image-prompt' },
  { label: '营销广告', path: '/marketing' },
  { label: '订单管理', path: '/orders' },
  { label: '客户服务', path: '/customer-service' },
  { label: '数据分析', path: '/market' },
  { label: '审批中心', path: '/review' },
  { label: '自动化流程', path: '/automation' },
  { label: '平台连接', path: '/store-monitor' },
  { label: '团队与设置', path: '/team' },
];

const secondaryRouteTitles: NavigationItem[] = [
  { label: '团队协作', path: '/team/operations' },
  { label: '订单同步与诊断', path: '/orders/operations' },
  { label: '趋势洞察', path: '/trend-radar' },
  { label: '商品调研', path: '/product-research' },
  { label: '利润计算', path: '/profit-calculator' },
  { label: '关键词分析', path: '/keyword-analysis' },
  { label: '客户服务业务接入', path: '/customer-service/operations' },
  { label: '智能体路线图', path: '/agent-roadmap/operations' },
  { label: '账单与套餐', path: '/billing' },
  { label: 'Ozon 竞争监控', path: '/competition' },
  { label: 'Ozon 业务分析', path: '/market/operations' },
  { label: '机会分析', path: '/opportunity' },
  { label: '热门商品', path: '/hot-products' },
];

export function routeTitleForPath(pathname: string): string | null {
  return [...navigationItems, ...secondaryRouteTitles]
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

  return navigationItems.filter((item) =>
    `${item.label} ${item.path}`
      .toLocaleLowerCase('zh-CN')
      .includes(normalizedQuery),
  );
}
