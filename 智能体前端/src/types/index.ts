import type {
  KeywordMetricEvidence,
  KeywordMetricStatus,
} from '../utils/keyword-evidence.ts';

// 用户相关
export interface User {
  name: string;
  avatar: string;
  role: string;
}

// 导航
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
}

export interface ChannelGroup {
  name: string;
  channels: { id: string; label: string; icon: string }[];
}

// 指标卡
export interface MetricData {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: string;
  color?: string;
}

// 统计数据
export interface StatsData {
  label: string;
  value: string | number;
  trend: 'up' | 'down' | 'neutral';
  change: number;
}

// 状态标签
export type StatusType = 'running' | 'success' | 'warning' | 'danger' | 'pending' | 'paused';

// 团队协作
export interface TeamMember {
  id: string;
  name: string;
  avatar: string;
  role: string;
  status: 'online' | 'offline' | 'away';
}

export interface KnowledgeItem {
  id: string;
  title: string;
  type: 'doc' | 'link' | 'note';
  updatedAt: string;
  author: string;
}

export interface PromptItem {
  id: string;
  title: string;
  content: string;
  category: string;
  isStarred: boolean;
}

export interface SOPItem {
  id: string;
  title: string;
  steps: number;
  status: 'published' | 'draft';
  updatedAt: string;
}

export interface TeamActivity {
  id: string;
  user: string;
  action: string;
  target: string;
  time: string;
  avatar: string;
}

export interface TaskItem {
  id: string;
  title: string;
  assignee: string;
  dueDate: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'in_progress' | 'done';
}

export interface ProjectSpace {
  id: string;
  name: string;
  platform: string;
  icon: string;
  memberCount: number;
  active: boolean;
}

// 自动化流程
export interface AutomationFlow {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: StatusType;
  channel: string;
  channelIcon: string;
  runDuration: string;
  successRate: number | null;
  nextRun: string;
  lastRun: string;
  isEnabled: boolean;
  latestRunId?: string | null;
  latestRunStatus?: string | null;
  latestRunError?: string | null;
  latestRunStartedAt?: string | null;
  latestRunFinishedAt?: string | null;
  agentFailureClass?: string | null;
  agentFailureStreak?: number | null;
  agentBackoffUntil?: string | null;
  automationSteps?: Array<Record<string, unknown>>;
  triggerConfig?: Record<string, unknown>;
  backendStatus?: string;
  workspaceId?: string | null;
}

export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

// 店铺监控
export interface StoreHealthMetrics {
  score: number;
  orders: number;
  sales: number;
  conversion: number;
  acos: number;
  negativeRate: number;
}

export interface AlertItem {
  id: string;
  type: 'warning' | 'danger' | 'info';
  title: string;
  description: string;
  time: string;
  platform: string;
}

export interface StorePerformance {
  platform: string;
  revenue: number;
  orders: number;
  profit: number;
  growth: number;
}

export interface InventoryAlert {
  id: string;
  product: string;
  sku: string;
  currentStock: number;
  minStock: number;
  status: 'normal' | 'low' | 'critical';
}

// 趋势洞察
export interface TrendDataPoint {
  date: string;
  value: number;
  category?: string;
}

export interface TrendCategory {
  id: string;
  name: string;
  growth: number;
  volume: string;
  color: string;
}

export interface HotTopic {
  id: string;
  title: string;
  platform: string;
 热度: number;
  trend: 'up' | 'down';
}

export interface RegionGrowth {
  region: string;
  growth: number;
  volume: string;
  flag: string;
}

// 选品研究
export interface ProductInsight {
  id: string;
  title: string;
  description: string;
  score: number;
  trend: 'up' | 'down';
  tags: string[];
}

export interface ProductOpportunity {
  id: string;
  name: string;
  image: string;
  priceRange: string;
  demandTrend: 'up' | 'stable';
  opportunityScore: number;
  platform: string;
}

// 利润计算
export interface CostInput {
  label: string;
  key: string;
  value: number;
  unit: string;
}

export interface PricingResult {
  salePrice: number;
  suggestedMin: number;
  suggestedMax: number;
  estimatedProfit: number;
  profitMargin: number;
  roi: number;
}

export interface ScenarioSimulation {
  id: string;
  name: string;
  price: number;
  profit: number;
  margin: number;
  demand: string;
}

// Listing
export interface ListingModule {
  id: string;
  title: string;
  icon: string;
}

export interface TitleCandidate {
  id: string;
  title: string;
  score?: number | null;
  features: string[];
}

export interface ListingPreview {
  title: string;
  productName?: string;
  platform?: string;
  rating?: number | null;
  reviewCount?: number | null;
  price?: number | null;
  bulletPoints: string[];
  seoTags: string[];
  images: string[];
}

// 关键词
export interface KeywordData {
  id: string;
  keyword: string;
  searchVolume: number | null;
  trend: 'up' | 'down' | 'stable';
  trendData: number[];
  competition: 'low' | 'medium' | 'high' | null;
  difficulty: number | null;
  opportunityScore: number | null;
  platform: string;
  platformIcon: string;
  totalKeywords?: number | null;
  metricStatus: KeywordMetricStatus;
  metricEvidence: KeywordMetricEvidence | null;
}

export interface LongTailKeyword {
  id: string;
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  metricStatus: KeywordMetricStatus;
  metricEvidence: KeywordMetricEvidence | null;
}

// 图片工作台
export interface ImageMode {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

export interface StylePreset {
  id: string;
  name: string;
  preview: string;
}

// 智能体回调接口
export interface AgentCallbacks {
  onSendMessage?: (message: string) => void;
  onRunAgent?: (agentId: string, params: Record<string, unknown>) => void;
  onUploadFile?: (file: File) => void;
  onGenerateImage?: (prompt: string) => void;
  onAnalyzeKeyword?: (keyword: string) => void;
  onOptimizePrompt?: (prompt: string) => void;
}
