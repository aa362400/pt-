import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  CreditCard,
  Key,
  Lock,
  Mail,
  Settings,
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import * as authApi from '../api/auth';
import {
  organizationsApi,
  type Organization,
  type OrganizationMember,
} from '../api/organizations';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/ui/use-toast';

const roleLabel: Record<OrganizationMember['role'], string> = {
  OWNER: 'textyestext',
  ADMIN: 'english_text',
  MEMBER: 'text',
  VIEWER: 'english_text',
};
const statusLabel: Record<OrganizationMember['status'], string> = {
  ACTIVE: 'text',
  INVITED: 'english_text',
  SUSPENDED: 'english_text',
  REMOVED: 'english_text',
};

type SettingsTab =
  | 'members'
  | 'permissions'
  | 'notifications'
  | 'billing'
  | 'api-keys'
  | 'security';

const tabs: Array<{
  key: SettingsTab;
  label: string;
  icon: typeof Users;
}> = [
  { key: 'members', label: 'teamtext', icon: Users },
  { key: 'permissions', label: 'english_text', icon: Shield },
  { key: 'notifications', label: 'notificationtext', icon: Bell },
  { key: 'billing', label: 'english_text', icon: CreditCard },
  { key: 'api-keys', label: 'API secret', icon: Key },
  { key: 'security', label: 'securitytext', icon: Lock },
];

export default function TeamSettingsV2() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('members');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState<authApi.TwoFactorSetup | null>(null);
  const [enableToken, setEnableToken] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [securityBusy, setSecurityBusy] = useState<'generate' | 'enable' | 'disable' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [org, result, me] = await Promise.all([
        organizationsApi.current(),
        organizationsApi.listMembers({ limit: 100 }),
        authApi.fetchMe(),
      ]);
      setOrganization(org);
      setMembers(result.items);
      setTwoFactorEnabled(me.twoFactorEnabled);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'teamtextsecuritytextreadfailed', 'error');
      setOrganization(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateTwoFactor = async () => {
    setSecurityBusy('generate');
    try {
      const setup = await authApi.generateTwoFactor();
      setTwoFactorSetup(setup);
      setEnableToken('');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'generationenglish_textsecretfailed', 'error');
    } finally {
      setSecurityBusy(null);
    }
  };

  const enableTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSecurityBusy('enable');
    try {
      await authApi.enableTwoFactor(enableToken.trim());
      setTwoFactorEnabled(true);
      setTwoFactorSetup(null);
      setEnableToken('');
      addToast('english_text。publishtext Ozon english_text。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'english_textfailed', 'error');
    } finally {
      setSecurityBusy(null);
    }
  };

  const disableTwoFactor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSecurityBusy('disable');
    try {
      await authApi.disableTwoFactor(disableToken.trim());
      setTwoFactorEnabled(false);
      setDisableToken('');
      addToast('english_text；real Ozon publishenglish_textsecurityenglish_text。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'english_textfailed', 'error');
    } finally {
      setSecurityBusy(null);
    }
  };

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">teamenglish_text</h1>
          <p className="mt-1 text-gray-500">
            {organization?.name ?? 'english_text'} · textrealtext、english_textsecurity
          </p>
        </div>
        <button
          onClick={() => navigate('/team/operations')}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-medium text-white"
        >
          <Settings className="h-4 w-4" />english_textteamtext
        </button>
      </div>

      <div className="mb-8 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto border-b border-gray-200">
          <div className="flex min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex items-center gap-2 px-6 py-4 text-sm font-medium ${activeTab === tab.key ? 'text-blue-600' : 'text-gray-600'}`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {activeTab === tab.key ? <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-600" /> : null}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'members' ? (
          <div className="p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">teamtext</h2>
                <p className="mt-1 text-sm text-gray-500">realtext {members.length} text</p>
              </div>
              <button onClick={() => navigate('/team/operations')} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">
                <UserPlus className="h-4 w-4" />english_text
              </button>
            </div>
            {loading ? (
              <div className="py-16 text-center text-sm text-gray-500">textreadrealenglish_text...</div>
            ) : members.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">
                backendenglish_text；english_textuser：{user?.email ?? 'english_text'}
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  const name = member.user.name || member.user.email.split('@')[0] || 'user';
                  return (
                    <div key={member.id} className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4 md:flex-row md:items-center">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 font-bold text-white">{name.slice(0, 2).toUpperCase()}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-bold text-gray-900">{name}</h3>
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{roleLabel[member.role]}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{statusLabel[member.status]}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-1 text-sm text-gray-500"><Mail className="h-3 w-3" /><span className="truncate">{member.user.email}</span></div>
                      </div>
                      <div className="text-xs text-gray-400">text：{new Date(member.createdAt).toLocaleDateString('zh-CN')}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'security' ? (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">securitytext</h2>
              <p className="mt-1 text-sm text-gray-500">realtextpublishenglish_textcompletedenglish_text。</p>
            </div>
            <section className="rounded-xl border border-gray-200 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><ShieldCheck className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-semibold text-gray-950">english_text（TOTP）</h3>
                    <p className="mt-1 text-sm text-gray-600">english_text TOTP english_text。secretenglish_text。</p>
                  </div>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${twoFactorEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {twoFactorEnabled === null ? 'readtext' : twoFactorEnabled ? 'english_text' : 'english_text'}
                </span>
              </div>

              {twoFactorEnabled === false && !twoFactorSetup ? (
                <button type="button" onClick={() => void generateTwoFactor()} disabled={securityBusy !== null} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {securityBusy === 'generate' ? 'textgeneration...' : 'english_text'}
                </button>
              ) : null}

              {twoFactorEnabled === false && twoFactorSetup ? (
                <div className="mt-5 grid gap-5 border-t border-gray-100 pt-5 md:grid-cols-[220px_1fr]">
                  <img src={twoFactorSetup.qrCode} alt="english_text" className="h-[220px] w-[220px] rounded-lg border border-gray-200" />
                  <form onSubmit={enableTwoFactor} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-800">noneenglish_textinputsecret</label>
                      <code className="mt-1 block break-all rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{twoFactorSetup.secret}</code>
                    </div>
                    <label className="block text-sm font-medium text-gray-800">
                      english_text 6 english_text
                      <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={enableToken} onChange={(event) => setEnableToken(event.target.value.replace(/\D/g, ''))} className="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2" />
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" disabled={securityBusy !== null || enableToken.length !== 6} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{securityBusy === 'enable' ? 'english_text...' : 'english_text'}</button>
                      <button type="button" onClick={() => { setTwoFactorSetup(null); setEnableToken(''); }} disabled={securityBusy !== null} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">text</button>
                    </div>
                  </form>
                </div>
              ) : null}

              {twoFactorEnabled ? (
                <form onSubmit={disableTwoFactor} className="mt-5 border-t border-gray-100 pt-5">
                  <label className="block text-sm font-medium text-gray-800">
                    english_text，textinputtext 6 english_text
                    <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={disableToken} onChange={(event) => setDisableToken(event.target.value.replace(/\D/g, ''))} className="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2" />
                  </label>
                  <button type="submit" disabled={securityBusy !== null || disableToken.length !== 6} className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">{securityBusy === 'disable' ? 'english_text...' : 'english_text'}</button>
                </form>
              ) : null}
            </section>
          </div>
        ) : (
          <div className="p-6">
            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
              <p className="text-sm text-gray-600">english_textteamenglish_text。</p>
              <button type="button" onClick={() => navigate('/team/operations')} className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">english_text</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
