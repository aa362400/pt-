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
import { organizationNameForCustomer } from '../utils/profile-display';

const roleLabel: Record<OrganizationMember['role'], string> = {
  OWNER: '所有者',
  ADMIN: '管理员',
  MEMBER: '成员',
  VIEWER: '只读成员',
};
const statusLabel: Record<OrganizationMember['status'], string> = {
  ACTIVE: '活跃',
  INVITED: '待接受',
  SUSPENDED: '已暂停',
  REMOVED: '已移除',
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
  { key: 'members', label: '团队成员', icon: Users },
  { key: 'permissions', label: '权限管理', icon: Shield },
  { key: 'notifications', label: '通知设置', icon: Bell },
  { key: 'billing', label: '账单与套餐', icon: CreditCard },
  { key: 'api-keys', label: 'API 密钥', icon: Key },
  { key: 'security', label: '安全设置', icon: Lock },
];

export default function TeamSettingsV2() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('members');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
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
      addToast(error instanceof Error ? error.message : '团队与安全设置读取失败', 'error');
      setOrganization(null);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setProfileName(user?.name ?? '');
  }, [user?.name]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!profileName.trim()) {
      addToast('账户显示名称不能为空。', 'error');
      return;
    }
    setProfileSaving(true);
    try {
      await updateProfile(profileName.trim());
      addToast('账户名称已保存。', 'success');
      await load();
    } catch (error) {
      addToast(error instanceof Error ? error.message : '账户名称保存失败', 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const generateTwoFactor = async () => {
    setSecurityBusy('generate');
    try {
      const setup = await authApi.generateTwoFactor();
      setTwoFactorSetup(setup);
      setEnableToken('');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '生成双重验证密钥失败', 'error');
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
      addToast('双重验证已启用。发布到 Ozon 前仍会要求一次新鲜验证。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '启用双重验证失败', 'error');
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
      addToast('双重验证已停用；真实 Ozon 发布将继续被安全门禁阻止。', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : '停用双重验证失败', 'error');
    } finally {
      setSecurityBusy(null);
    }
  };

  return (
    <div className="p-0">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">团队与设置</h1>
          <p className="mt-1 text-gray-500">
            {organizationNameForCustomer(organization?.name)} · 管理真实成员、权限与账户安全
          </p>
        </div>
        <button
          onClick={() => navigate('/team/operations')}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 px-5 py-2.5 text-sm font-medium text-white"
        >
          <Settings className="h-4 w-4" />打开完整团队设置
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
            <form onSubmit={saveProfile} className="mb-6 rounded-xl border border-blue-100 bg-blue-50/40 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <label className="min-w-0 flex-1 text-sm font-medium text-gray-800">
                  账户显示名称
                  <input
                    required
                    maxLength={100}
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                    className="mt-1 block h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none focus:border-blue-500"
                    placeholder="例如：平台管理员"
                  />
                  <span className="mt-1 block text-xs font-normal text-gray-500">此名称会显示在左侧导航和审批记录中。</span>
                </label>
                <button
                  type="submit"
                  disabled={profileSaving || !profileName.trim() || profileName.trim() === user?.name}
                  className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {profileSaving ? '正在保存...' : '保存账户名称'}
                </button>
              </div>
            </form>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">团队成员</h2>
                <p className="mt-1 text-sm text-gray-500">真实成员 {members.length} 名</p>
              </div>
              <button onClick={() => navigate('/team/operations')} className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700">
                <UserPlus className="h-4 w-4" />邀请成员
              </button>
            </div>
            {loading ? (
              <div className="py-16 text-center text-sm text-gray-500">正在读取真实组织成员...</div>
            ) : members.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-500">
                后端未返回组织成员；当前登录用户：{user?.email ?? '未返回'}
              </div>
            ) : (
              <div className="space-y-3">
                {members.map((member) => {
                  const name = member.user.name || member.user.email.split('@')[0] || '用户';
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
                      <div className="text-xs text-gray-400">加入：{new Date(member.createdAt).toLocaleDateString('zh-CN')}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : activeTab === 'security' ? (
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-bold text-gray-900">安全设置</h2>
              <p className="mt-1 text-sm text-gray-500">真实外部发布必须使用密码和动态验证码完成五分钟内的身份确认。</p>
            </div>
            <section className="rounded-xl border border-gray-200 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="rounded-lg bg-blue-50 p-2 text-blue-700"><ShieldCheck className="h-5 w-5" /></span>
                  <div>
                    <h3 className="font-semibold text-gray-950">验证器双重验证（TOTP）</h3>
                    <p className="mt-1 text-sm text-gray-600">使用任意兼容 TOTP 的验证器扫描二维码。密钥只在本次设置中显示。</p>
                  </div>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-medium ${twoFactorEnabled ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {twoFactorEnabled === null ? '读取中' : twoFactorEnabled ? '已启用' : '未启用'}
                </span>
              </div>

              {twoFactorEnabled === false && !twoFactorSetup ? (
                <button type="button" onClick={() => void generateTwoFactor()} disabled={securityBusy !== null} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {securityBusy === 'generate' ? '正在生成...' : '开始设置双重验证'}
                </button>
              ) : null}

              {twoFactorEnabled === false && twoFactorSetup ? (
                <div className="mt-5 grid gap-5 border-t border-gray-100 pt-5 md:grid-cols-[220px_1fr]">
                  <img src={twoFactorSetup.qrCode} alt="双重验证二维码" className="h-[220px] w-[220px] rounded-lg border border-gray-200" />
                  <form onSubmit={enableTwoFactor} className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-800">无法扫码时手动输入密钥</label>
                      <code className="mt-1 block break-all rounded-lg bg-gray-50 p-3 text-sm text-gray-800">{twoFactorSetup.secret}</code>
                    </div>
                    <label className="block text-sm font-medium text-gray-800">
                      验证器中的 6 位动态验证码
                      <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={enableToken} onChange={(event) => setEnableToken(event.target.value.replace(/\D/g, ''))} className="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2" />
                    </label>
                    <div className="flex gap-2">
                      <button type="submit" disabled={securityBusy !== null || enableToken.length !== 6} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{securityBusy === 'enable' ? '正在启用...' : '验证并启用'}</button>
                      <button type="button" onClick={() => { setTwoFactorSetup(null); setEnableToken(''); }} disabled={securityBusy !== null} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">取消</button>
                    </div>
                  </form>
                </div>
              ) : null}

              {twoFactorEnabled ? (
                <form onSubmit={disableTwoFactor} className="mt-5 border-t border-gray-100 pt-5">
                  <label className="block text-sm font-medium text-gray-800">
                    如需停用，请输入当前 6 位动态验证码
                    <input required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={disableToken} onChange={(event) => setDisableToken(event.target.value.replace(/\D/g, ''))} className="mt-1 block w-full max-w-xs rounded-lg border border-gray-300 px-3 py-2" />
                  </label>
                  <button type="submit" disabled={securityBusy !== null || disableToken.length !== 6} className="mt-3 rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 disabled:opacity-50">{securityBusy === 'disable' ? '正在停用...' : '停用双重验证'}</button>
                </form>
              ) : null}
            </section>
          </div>
        ) : (
          <div className="p-6">
            <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center">
              <p className="text-sm text-gray-600">该设置由完整团队控制台管理。</p>
              <button type="button" onClick={() => navigate('/team/operations')} className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">打开完整设置</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
