import { useLocation, useNavigate } from 'react-router-dom';
import { Gift, Bell, Sparkles, Menu, ChevronDown } from 'lucide-react';
import { Dropdown, DropdownItem } from '../ui/Dropdown.tsx';
import { useToast } from '../ui/use-toast.ts';
import { useAuth } from '../../auth/AuthContext.tsx';
import LanguageSwitcher from '../../i18n/LanguageSwitcher.tsx';
import { useTranslation } from 'react-i18next';

function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const pageTitles: Record<string, { title: string; subtitle: string }> = {
    '/assistant': { title: t('dashboard.title'), subtitle: t('dashboard.subtitle') },
    '/opportunity': { title: t('nav.opportunity'), subtitle: t('dashboard.todayOpportunitiesDesc') },
    '/hot-products': { title: t('nav.hotProducts'), subtitle: t('storeMonitor.suggestionListingOptimize') || '' },
    '/product-research': { title: t('nav.productResearch'), subtitle: t('productResearch.subtitle') },
    '/keyword-analysis': { title: t('nav.keywordAnalysis'), subtitle: t('keywordAnalysis.subtitle') },
    '/listing-generator': { title: t('nav.listingGenerator'), subtitle: t('listingGenerator.subtitle') },
    '/profit-calculator': { title: t('nav.profitCalculator'), subtitle: t('profitCalculator.subtitle') },
    '/store-monitor': { title: t('nav.storeMonitor'), subtitle: t('storeMonitor.subtitle') },
    '/trend-radar': { title: t('nav.trendRadar'), subtitle: t('trendInsight.subtitle') },
    '/competition': { title: t('nav.competition'), subtitle: '' },
    '/market': { title: t('nav.market'), subtitle: '' },
    '/team': { title: t('nav.team'), subtitle: t('team.subtitle') },
    '/automation': { title: t('nav.automation'), subtitle: t('automation.subtitle') },
    '/image-prompt': { title: t('nav.imagePrompt'), subtitle: t('imageWorkbench.subtitle') },
    '/review': { title: t('nav.review'), subtitle: '' },
    '/audit-logs': { title: t('nav.auditLogs'), subtitle: '' },
    '/billing': { title: t('nav.billing'), subtitle: '' },
  };
  const pageInfo = pageTitles[location.pathname] || { title: t('topbar.pageTitleDefault'), subtitle: t('topbar.pageSubtitleDefault') };
  const { addToast } = useToast();
  const { user, logout } = useAuth();
  const displayName = user?.name ?? '用户';

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <header className="fixed top-0 right-0 left-0 md:left-[250px] z-20 flex h-16 items-center justify-between gap-3 border-b border-[#EEF0FA] bg-white/90 px-4 md:px-6 backdrop-blur-sm">
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex items-center gap-2.5 min-w-0">
        {/* Hamburger menu button - mobile only */}
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#4A5578] hover:bg-[#F8F9FF] transition-colors md:hidden"
          aria-label={t('topbar.openMenu')}
        >
          <Menu size={20} />
        </button>
        <Sparkles size={18} className="hidden md:block text-[#6C63FF] shrink-0" />
        <div className="min-w-0">
          <h1 className="text-sm md:text-base font-semibold text-[#1A1A2E] truncate">{pageInfo.title}</h1>
          <p className="hidden md:block text-xs text-[#8B93B5] truncate">{pageInfo.subtitle}</p>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        {/* 邀请有礼 - icon only on mobile, full on desktop */}
        <button
          className="flex items-center gap-1.5 rounded-lg bg-[#F0EEFF] px-2.5 md:px-3.5 py-2 text-sm font-medium text-[#6C63FF] transition-colors hover:bg-[#E5DEFF]"
          onClick={() => addToast(t('topbar.inviteSuccess'), 'success')}
          aria-label={t('topbar.inviteGiftAria')}
        >
          <Gift size={16} />
          <span className="hidden md:inline">{t('topbar.inviteGift')}</span>
        </button>

        {/* Notification */}
        <button
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[#8B93B5] hover:bg-[#F8F9FF] transition-colors"
          onClick={() => addToast(t('topbar.notificationMessage'), 'info')}
          aria-label={t('topbar.notificationAria')}
        >
          <Bell size={18} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#FF5A6A]" />
        </button>

        {/* LanguageSwitcher */}
        <LanguageSwitcher />

        {/* Divider - desktop only */}
        <div className="hidden md:block h-6 w-px bg-[#EEF0FA]" />

        {/* User menu */}
        <Dropdown
          align="right"
          trigger={
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-[#6C63FF] to-[#8B7CFF] text-white text-sm font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:flex flex-col">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium text-[#1A1A2E]">{t('topbar.greeting', { name: displayName })}</span>
                  <ChevronDown size={14} className="text-[#8B93B5]" />
                </div>
                <span className="text-xs text-[#8B93B5]">{user?.email ?? ''}</span>
              </div>
            </div>
          }
        >
          <DropdownItem onClick={() => void handleLogout()}>{t('topbar.logout')}</DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
}

export default TopBar;
