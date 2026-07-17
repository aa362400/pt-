import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import MainLayout from "./layouts/MainLayout";
import ProtectedRoute from "./auth/ProtectedRoute";

// Code-split pages via React.lazy for smaller initial bundle
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const TrendInsight = lazy(() => import("./pages/TrendInsight"));
const PlatformConnectionV2 = lazy(
  () => import("./pages-v2/PlatformConnectionV2"),
);
const KeywordAnalysis = lazy(() => import("./pages/KeywordAnalysis"));
const ProductResearch = lazy(() => import("./pages/ProductResearch"));
const DailyProductResearch = lazy(() => import("./pages/DailyProductResearch"));
const ProductManagementV2 = lazy(
  () => import("./pages-v2/ProductManagementV2"),
);
const OrdersSync = lazy(() => import("./pages/OrdersSync"));
const OrderManagementV2 = lazy(() => import("./pages-v2/OrderManagementV2"));
const AutomationFlowV2 = lazy(() => import("./pages-v2/AutomationFlowV2"));
const ProfitCalculator = lazy(() => import("./pages/ProfitCalculator"));
const OzonPricingCalculator = lazy(() => import("./pages/OzonPricingCalculator"));
const ContentAndMediaV2 = lazy(() => import("./pages-v2/ContentAndMediaV2"));
const TeamCollaboration = lazy(() => import("./pages/TeamCollaboration"));
const TeamSettingsV2 = lazy(() => import("./pages-v2/TeamSettingsV2"));
const ApprovalCenterV2 = lazy(() => import("./pages-v2/ApprovalCenterV2"));
const McpToolConsole = lazy(() => import("./pages/McpToolConsole"));
const AuditLogViewer = lazy(() => import("./pages/AuditLogViewer"));
const BillingPage = lazy(() => import("./pages/BillingPage"));
const AgentRoadmap = lazy(() => import("./pages/AgentRoadmap"));
const AIAgentCenterV2 = lazy(() => import("./pages-v2/AIAgentCenterV2"));
const OzonBusinessIntelligence = lazy(
  () => import("./pages/OzonBusinessIntelligence"),
);
const DataAnalysisV2 = lazy(() => import("./pages-v2/DataAnalysisV2"));
const ListingOverviewV2 = lazy(() => import("./pages-v2/ListingOverviewV2"));
const MarketingOverviewV2 = lazy(
  () => import("./pages-v2/MarketingOverviewV2"),
);
const PlaceholderPage = lazy(() => import("./pages/PlaceholderPage"));
const CustomerServiceV2 = lazy(() => import("./pages-v2/CustomerServiceV2"));
const CapabilityCenter = lazy(() => import("./pages/CapabilityCenter"));
const EnterpriseTeam = lazy(() => import("./pages/EnterpriseTeam"));
const SupplyChain = lazy(() => import("./pages/SupplyChain"));
const EnterpriseReadiness = lazy(() => import("./pages/EnterpriseReadiness"));
const MemoryGovernance = lazy(() => import("./pages/MemoryGovernance"));
const AgentConsole = lazy(() => import("./pages/AgentConsole"));
const OzonObservations = lazy(() => import("./pages/OzonObservations"));
const AgentQualityCenter = lazy(() => import("./pages/AgentQualityCenter"));

function PageFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex items-center gap-3 text-[#6C63FF]">
        <div className="h-5 w-5 rounded-full border-2 border-[#6C63FF] border-t-transparent animate-spin" />
        <span className="text-sm">{t("common.loading")}</span>
      </div>
    </div>
  );
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Navigate to="/assistant" replace />} />
              <Route path="/workbench" element={<Navigate to="/assistant" replace />} />
              <Route path="/assistant" element={<Dashboard />} />
              <Route path="/agent-console" element={<AgentConsole />} />
              <Route path="/team" element={<TeamSettingsV2 />} />
              <Route path="/team/operations" element={<TeamCollaboration />} />
              <Route path="/automation" element={<AutomationFlowV2 />} />
              <Route path="/automation/operations" element={<Navigate to="/automation" replace />} />
              <Route path="/store-monitor" element={<PlatformConnectionV2 />} />
              <Route
                path="/store-monitor/operations"
                element={<Navigate to="/store-monitor" replace />}
              />
              <Route path="/trend-radar" element={<TrendInsight />} />
              <Route path="/product-research" element={<ProductResearch />} />
              <Route path="/daily-product-research" element={<DailyProductResearch />} />
              <Route path="/ozon-observations" element={<OzonObservations />} />
              <Route path="/products" element={<ProductManagementV2 />} />
              <Route
                path="/products/operations"
                element={<Navigate to="/products" replace />}
              />
              <Route path="/orders" element={<OrderManagementV2 />} />
              <Route path="/orders/operations" element={<OrdersSync />} />
              <Route path="/profit-calculator" element={<ProfitCalculator />} />
              <Route path="/ozon-pricing" element={<OzonPricingCalculator />} />
              <Route path="/marketing" element={<MarketingOverviewV2 />} />
              <Route path="/customer-service" element={<CustomerServiceV2 />} />
              <Route
                path="/customer-service/operations"
                element={
                  <PlaceholderPage
                    pageTitle="客户服务业务接入"
                    description="当前后端未提供可读取的 Ozon 客户消息合同；完成接口接入前禁止发送或伪造会话。"
                    tags={["消息同步待接入", "回复建议待接入", "高风险转人工"]}
                  />
                }
              />
              <Route
                path="/listing-generator"
                element={<ListingOverviewV2 />}
              />
              <Route
                path="/listing-generator/operations"
                element={<Navigate to="/listing-generator" replace />}
              />
              <Route path="/keyword-analysis" element={<KeywordAnalysis />} />
              <Route path="/image-prompt" element={<ContentAndMediaV2 />} />
              <Route
                path="/image-prompt/operations"
                element={<Navigate to="/image-prompt" replace />}
              />
              <Route
                path="/opportunity"
                element={<Dashboard tab="opportunity" />}
              />
              <Route
                path="/hot-products"
                element={<Dashboard tab="hot-products" />}
              />
              <Route path="/mcp-tools" element={<McpToolConsole />} />
              <Route path="/review" element={<ApprovalCenterV2 />} />
              <Route path="/review/operations" element={<Navigate to="/review" replace />} />
              <Route path="/audit-logs" element={<AuditLogViewer />} />
              <Route path="/agent-quality" element={<AgentQualityCenter />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/agent-roadmap" element={<AIAgentCenterV2 />} />
              <Route
                path="/agent-roadmap/operations"
                element={<AgentRoadmap />}
              />
              <Route path="/operations-center" element={<CapabilityCenter />} />
              <Route path="/enterprise-team" element={<EnterpriseTeam />} />
              <Route path="/supply-chain" element={<SupplyChain />} />
              <Route
                path="/enterprise-readiness"
                element={<EnterpriseReadiness />}
              />
              <Route path="/memory-governance" element={<MemoryGovernance />} />
              <Route
                path="/competition"
                element={<OzonBusinessIntelligence mode="competition" />}
              />
              <Route path="/market" element={<DataAnalysisV2 />} />
              <Route
                path="/market/operations"
                element={<OzonBusinessIntelligence mode="market" />}
              />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default AppRouter;
