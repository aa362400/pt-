import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import MainLayout from './layouts/MainLayout';
import ProtectedRoute from './auth/ProtectedRoute';

// Code-split pages via React.lazy for smaller initial bundle
const Login = lazy(() => import('./pages/Login'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const TrendInsight = lazy(() => import('./pages/TrendInsight'));
const StoreMonitor = lazy(() => import('./pages/StoreMonitor'));
const KeywordAnalysis = lazy(() => import('./pages/KeywordAnalysis'));
const ProductResearch = lazy(() => import('./pages/ProductResearch'));
const Automation = lazy(() => import('./pages/Automation'));
const ListingGenerator = lazy(() => import('./pages/ListingGenerator'));
const ProfitCalculator = lazy(() => import('./pages/ProfitCalculator'));
const ImageWorkbench = lazy(() => import('./pages/ImageWorkbench'));
const TeamCollaboration = lazy(() => import('./pages/TeamCollaboration'));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage'));
const ReviewCenter = lazy(() => import('./pages/ReviewCenter'));
const AuditLogViewer = lazy(() => import('./pages/AuditLogViewer'));
const BillingPage = lazy(() => import('./pages/BillingPage'));

function PageFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex items-center gap-3 text-[#6C63FF]">
        <div className="h-5 w-5 rounded-full border-2 border-[#6C63FF] border-t-transparent animate-spin" />
        <span className="text-sm">{t('common.loading')}</span>
      </div>
    </div>
  );
}

function App() {
  const { t } = useTranslation();
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Navigate to="/assistant" replace />} />
              <Route path="/assistant" element={<Dashboard />} />
              <Route path="/team" element={<TeamCollaboration />} />
              <Route path="/automation" element={<Automation />} />
              <Route path="/store-monitor" element={<StoreMonitor />} />
              <Route path="/trend-radar" element={<TrendInsight />} />
              <Route path="/product-research" element={<ProductResearch />} />
              <Route path="/profit-calculator" element={<ProfitCalculator />} />
              <Route path="/listing-generator" element={<ListingGenerator />} />
              <Route path="/keyword-analysis" element={<KeywordAnalysis />} />
              <Route path="/image-prompt" element={<ImageWorkbench />} />
              <Route path="/opportunity" element={<Dashboard tab="opportunity" />} />
              <Route path="/hot-products" element={<Dashboard tab="hot-products" />} />
              <Route path="/review" element={<ReviewCenter />} />
              <Route path="/audit-logs" element={<AuditLogViewer />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route
                path="/competition"
                element={
                  <PlaceholderPage
                    pageTitle={t('nav.competition')}
                    description={t('nav.proFeatureList')}
                    tags={[t('common.price'), t('common.filter'), t('common.export'), '差异']}
                  />
                }
              />
              <Route
                path="/market"
                element={
                  <PlaceholderPage
                    pageTitle={t('nav.market')}
                    description="全球市场数据总览，掌握各区域销售趋势"
                    tags={['市场规模', '区域分析', '品类趋势', '汇率影响']}
                  />
                }
              />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
