import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bot, TrendingUp, Hash, FileText, Calculator, Activity, BarChart3,
  Crosshair, Globe, Zap, Search, Sparkles, Plus,
  Rocket, Users, Image, Play, X, Check
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../ui/use-toast.ts';
import Modal from '../ui/Modal.tsx';

function Sidebar({ mobileOpen = false, onClose }: { mobileOpen?: boolean; onClose?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const { t } = useTranslation();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showChannelMgmt, setShowChannelMgmt] = useState(false);
  const [showAddChannel, setShowAddChannel] = useState(false);

  const navItems = useMemo(() => [
    { id: '/assistant', label: t('nav.assistant'), icon: Bot },
    { id: '/opportunity', label: t('nav.opportunity'), icon: Zap },
    { id: '/hot-products', label: t('nav.hotProducts'), icon: TrendingUp },
    { id: '/product-research', label: t('nav.productResearch'), icon: Search },
    { id: '/keyword-analysis', label: t('nav.keywordAnalysis'), icon: Hash },
    { id: '/listing-generator', label: t('nav.listingGenerator'), icon: FileText },
    { id: '/profit-calculator', label: t('nav.profitCalculator'), icon: Calculator },
    { id: '/store-monitor', label: t('nav.storeMonitor'), icon: Activity },
    { id: '/trend-radar', label: t('nav.trendRadar'), icon: BarChart3 },
    { id: '/team', label: t('nav.team'), icon: Users },
    { id: '/automation', label: t('nav.automation'), icon: Play },
    { id: '/image-prompt', label: t('nav.imagePrompt'), icon: Image },
    { id: '/competition', label: t('nav.competition'), icon: Crosshair },
    { id: '/market', label: t('nav.market'), icon: Globe },
  ], [t]);

  const channels = useMemo(() => [
    { id: 'amazon', label: t('nav.channelAmazon'), icon: 'A', color: '#232F3E' },
    { id: 'etsy', label: t('nav.channelEtsy'), icon: 'E', color: '#F56400' },
    { id: 'tiktok', label: t('nav.channelTikTok'), icon: '♫', color: '#000000' },
    { id: 'temu', label: t('nav.channelTemu'), icon: 'T', color: '#FF6A00' },
    { id: 'shopify', label: t('nav.channelDTC'), icon: '🛡', color: '#6C63FF' },
  ], [t]);

  const availableChannels = useMemo(() => [
    { id: 'amazon', label: t('nav.channelAmazon'), desc: t('nav.channelAmazonDesc'), color: '#232F3E', icon: 'A' },
    { id: 'etsy', label: t('nav.channelEtsy'), desc: t('nav.channelEtsyDesc'), color: '#F56400', icon: 'E' },
    { id: 'tiktok', label: t('nav.channelTikTok'), desc: t('nav.channelTikTokDesc'), color: '#000000', icon: '♫' },
    { id: 'temu', label: t('nav.channelTemu'), desc: t('nav.channelTemuDesc'), color: '#FF6A00', icon: 'T' },
    { id: 'shopify', label: t('nav.channelDTC'), desc: t('nav.channelDTCDesc'), color: '#6C63FF', icon: 'S' },
  ], [t]);

  // Close drawer when route changes on mobile
  useEffect(() => {
    if (mobileOpen && onClose) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleNavigate = (id: string) => {
    navigate(id);
  };

  return (
    <>
      {/* Backdrop overlay for mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 flex h-screen w-[250px] flex-col border-r border-[#EEF0FA] bg-white transition-transform duration-300 ease-in-out md:z-30 md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2.5 border-b border-[#EEF0FA] px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#6C63FF] to-[#8B7CFF] text-white text-sm font-bold">
            S
          </div>
          <span className="text-base font-bold text-[#1A1A2E] tracking-tight">ShopMate AI</span>
          <span className="text-[10px] font-semibold text-white bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] px-1.5 py-0.5 rounded-md ml-0.5">Pro</span>
        </div>
        {/* Mobile close button */}
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8B93B5] hover:bg-[#F8F9FF] transition-colors md:hidden"
          aria-label={t('topbar.closeMenu') || '关闭菜单'}
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = location.pathname === item.id;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={() => handleNavigate(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#F0EEFF] text-[#6C63FF]'
                      : 'text-[#4A5578] hover:bg-[#F8F9FF] hover:text-[#6C63FF]'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 1.5} />
                  <span>{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Sales Channels Section */}
        <div className="mt-6">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-xs font-semibold text-[#8B93B5] uppercase tracking-wider">{t('sidebar.channels')}</span>
            <button
              className="text-xs text-[#6C63FF] hover:underline flex items-center gap-0.5"
              onClick={() => setShowChannelMgmt(true)}
            >
              <Plus size={12} />
              {t('sidebar.manage')}
            </button>
          </div>
          <ul className="space-y-0.5">
            {channels.map((ch) => (
              <li key={ch.id}>
                <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#4A5578] hover:bg-[#F8F9FF] transition-colors">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold"
                    style={{ backgroundColor: `${ch.color}10`, color: ch.color }}
                  >
                    {ch.icon}
                  </span>
                  <span>{ch.label}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-[#6C63FF] hover:bg-[#F0EEFF] transition-colors"
                onClick={() => setShowAddChannel(true)}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#F0EEFF] text-[#6C63FF] text-xs">
                  <Plus size={14} />
                </span>
                <span>{t('sidebar.addChannel')}</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>

      {/* Upgrade Card */}
      <div className="shrink-0 px-3 pb-4">
        <button
          onClick={() => setShowUpgrade(true)}
          className="w-full relative rounded-xl bg-gradient-to-br from-[#6C63FF]/10 to-[#8B7CFF]/10 p-4 overflow-hidden text-left cursor-pointer hover:from-[#6C63FF]/15 hover:to-[#8B7CFF]/15 transition-colors"
        >
          <div className="absolute right-3 top-3 text-[#6C63FF]/30">
            <Rocket size={32} />
          </div>
          <h4 className="text-sm font-bold text-[#1A1A2E] mb-2">{t('nav.upgradePro')}</h4>
          <ul className="space-y-1 mb-3">
            <li className="flex items-center gap-1.5 text-xs text-[#6B7280]">
              <Sparkles size={12} className="text-[#6C63FF]" />
              {t('sidebar.featureAiFunctions')}
            </li>
            <li className="flex items-center gap-1.5 text-xs text-[#6B7280]">
              <Sparkles size={12} className="text-[#6C63FF]" />
              {t('sidebar.featureDailyUsage')}
            </li>
            <li className="flex items-center gap-1.5 text-xs text-[#6B7280]">
              <Sparkles size={12} className="text-[#6C63FF]" />
              {t('sidebar.featureDedicatedSupport')}
            </li>
          </ul>
          <div className="w-full rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] py-2 text-sm font-semibold text-white text-center transition-opacity hover:opacity-90">
            {t('sidebar.upgradeNow')}
          </div>
        </button>
      </div>

      {/* Upgrade Modal */}
      <Modal open={showUpgrade} onClose={() => setShowUpgrade(false)} title={t('sidebar.upgradeModalTitle')} width="max-w-md">
        <div className="text-center py-2">
          <Rocket size={48} className="mx-auto text-[#6C63FF] mb-3" />
          <h3 className="text-lg font-bold text-[#1A1A2E] mb-1">{t('sidebar.upgradeModalTitle')}</h3>
          <p className="text-sm text-[#6B7280] mb-6">{t('sidebar.upgradeModalDesc')}</p>
          <div className="space-y-3 text-left mb-6">
            {[
              t('sidebar.featureUnlimitedAI'),
              t('sidebar.featureAdvancedAnalytics'),
              t('sidebar.featureUnlimitedTeam'),
              t('sidebar.featureAllChannels'),
              t('sidebar.featureAIImage'),
              t('sidebar.featureDedicatedManager'),
            ].map((feat) => (
              <div key={feat} className="flex items-center gap-2.5 text-sm text-[#4A5578]">
                <Check size={16} className="text-[#34D399]" />
                {feat}
              </div>
            ))}
          </div>
          <button
            onClick={() => { addToast(t('sidebar.upgradeSuccess'), 'success'); setShowUpgrade(false); }}
            className="w-full rounded-lg bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            {t('sidebar.upgradePrice')}
          </button>
          <p className="text-xs text-[#8B93B5] mt-2">{t('sidebar.trialText')}</p>
        </div>
      </Modal>

      {/* Channel Management Modal */}
      <Modal open={showChannelMgmt} onClose={() => setShowChannelMgmt(false)} title={t('sidebar.channels')} width="max-w-md">
        <div className="space-y-2">
          {channels.map((ch) => (
            <div key={ch.id} className="flex items-center justify-between rounded-lg border border-[#E8E8F0] p-3">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-md text-sm font-bold" style={{ backgroundColor: `${ch.color}10`, color: ch.color }}>
                  {ch.icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-[#1A1A2E]">{ch.label}</p>
                  <p className="text-xs text-[#8B93B5]">{t('sidebar.connected')}</p>
                </div>
              </div>
              <button className="text-xs text-[#FF5A6A] hover:underline">{t('sidebar.disconnect')}</button>
            </div>
          ))}
        </div>
      </Modal>

      {/* Add Channel Modal */}
      <Modal open={showAddChannel} onClose={() => setShowAddChannel(false)} title={t('sidebar.addChannel')} width="max-w-md">
        <div className="space-y-2">
          {availableChannels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => { addToast(t('sidebar.channelConnected', { channel: ch.label }), 'success'); setShowAddChannel(false); }}
              className="w-full flex items-center gap-3 rounded-lg border border-[#E8E8F0] p-3 hover:border-[#6C63FF] hover:bg-[#F0EEFF] transition-colors text-left"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-md text-base font-bold" style={{ backgroundColor: `${ch.color}10`, color: ch.color }}>
                {ch.icon}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#1A1A2E]">{ch.label}</p>
                <p className="text-xs text-[#8B93B5]">{ch.desc}</p>
              </div>
              <Plus size={18} className="text-[#6C63FF]" />
            </button>
          ))}
        </div>
      </Modal>
    </aside>
    </>
  );
}

export default Sidebar;