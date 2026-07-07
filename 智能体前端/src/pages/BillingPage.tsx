import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Check, RefreshCw, Receipt } from 'lucide-react';
import { useToast } from '../components/ui/use-toast.ts';
import { billingApi } from '../api/billing';
import type { PlanInfo, CurrentPlan, BillingUsage, Invoice } from '../api/billing';

const PLAN_LABEL: Record<string, string> = {
  FREE: '免费版',
  STARTER: '入门版',
  PROFESSIONAL: '专业版',
  ENTERPRISE: '企业版',
};

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = limit <= 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[#4A5578]">{label}</span>
        <span className="text-[#8B8B9A]">
          {used} / {unlimited ? '不限' : limit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#F0F0F8]">
        <div
          className={`h-2 rounded-full ${pct >= 90 ? 'bg-red-400' : pct >= 70 ? 'bg-amber-400' : 'bg-[#6C63FF]'}`}
          style={{ width: unlimited ? '4%' : `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<PlanInfo[]>([]);
  const [current, setCurrent] = useState<CurrentPlan | null>(null);
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [plansRes, currentRes, usageRes, invoicesRes] = await Promise.all([
        billingApi.plans(),
        billingApi.currentPlan(),
        billingApi.usage(),
        billingApi.invoices({ limit: 10 }).catch(() => ({ items: [] as Invoice[], total: 0 })),
      ]);
      setPlans(plansRes);
      setCurrent(currentRes);
      setUsage(usageRes);
      setInvoices(invoicesRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载计费信息失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpgrade = async (plan: string) => {
    setCheckoutPlan(plan);
    try {
      const { url } = await billingApi.createCheckoutSession(plan);
      window.location.href = url;
    } catch (err) {
      addToast(err instanceof Error ? err.message : '创建支付会话失败', 'error');
      setCheckoutPlan(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-[#6C63FF]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#6C63FF] border-t-transparent" />
        <span className="text-sm">加载中…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <p className="text-sm text-red-500">{error}</p>
        <button onClick={fetchData} className="mt-3 text-sm text-[#6C63FF] underline">重试</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f0ff] p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-indigo-100">
            <CreditCard className="h-5 w-5 text-[#6C63FF]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1A1A2E]">套餐与计费</h1>
            <p className="text-xs text-[#8B8B9A]">
              当前套餐：
              <span className="font-semibold text-[#6C63FF]">
                {current ? (PLAN_LABEL[current.plan] ?? current.plan) : '-'}
              </span>
              {current?.trialEndsAt && (
                <span className="ml-2">试用至 {new Date(current.trialEndsAt).toLocaleDateString()}</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-lg border border-[#E8E8F0] bg-white px-3 py-2 text-sm text-[#4A5578] hover:bg-[#F8F9FF]"
        >
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      {/* Usage */}
      {usage?.quotas && (
        <div className="mb-6 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-[#1A1A2E]">本月用量</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
            <UsageBar label="产品" used={usage.quotas.products.used} limit={usage.quotas.products.limit} />
            <UsageBar label="智能体运行" used={usage.quotas.agentRuns.used} limit={usage.quotas.agentRuns.limit} />
            <UsageBar label="团队成员" used={usage.quotas.members.used} limit={usage.quotas.members.limit} />
            <UsageBar label="存储文件" used={usage.quotas.storage.used} limit={usage.quotas.storage.limit} />
            <UsageBar label="工作区" used={usage.quotas.workspaces.used} limit={usage.quotas.workspaces.limit} />
          </div>
        </div>
      )}

      {/* Plans */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = current?.plan === plan.name;
          return (
            <div
              key={plan.name}
              className={`flex flex-col rounded-xl border bg-white p-5 shadow-sm ${
                isCurrent ? 'border-[#6C63FF] ring-1 ring-[#6C63FF]/30' : 'border-[#E8E8F0]'
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1A1A2E]">{PLAN_LABEL[plan.name] ?? plan.name}</h3>
                {isCurrent && (
                  <span className="rounded-full bg-[#F0EEFF] px-2 py-0.5 text-[11px] font-medium text-[#6C63FF]">
                    当前
                  </span>
                )}
              </div>
              <p className="mb-3 min-h-[32px] text-xs text-[#8B8B9A]">{plan.description}</p>
              <p className="mb-4">
                <span className="text-2xl font-bold text-[#1A1A2E]">${plan.monthlyPrice}</span>
                <span className="text-xs text-[#8B8B9A]"> /月</span>
              </p>
              <ul className="mb-5 flex-1 space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-[#4A5578]">
                    <Check size={13} className="mt-0.5 shrink-0 text-emerald-500" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                disabled={isCurrent || checkoutPlan !== null}
                onClick={() => handleUpgrade(plan.name)}
                className={`w-full rounded-lg py-2 text-sm font-medium transition-colors ${
                  isCurrent
                    ? 'cursor-default bg-[#F0F0F8] text-[#B0B0BE]'
                    : 'bg-[#6C63FF] text-white hover:bg-[#5B52EE] disabled:opacity-60'
                }`}
              >
                {isCurrent ? '正在使用' : checkoutPlan === plan.name ? '跳转支付中…' : '升级'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Invoices */}
      <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#F0F0F8] px-5 py-3">
          <Receipt size={15} className="text-[#6C63FF]" />
          <h2 className="text-sm font-semibold text-[#1A1A2E]">账单记录</h2>
        </div>
        {invoices.length === 0 ? (
          <div className="py-10 text-center text-sm text-[#8B8B9A]">暂无账单记录</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F0F0F8] text-left text-xs text-[#8B8B9A]">
                <th className="px-5 py-3 font-medium">日期</th>
                <th className="px-5 py-3 font-medium">套餐</th>
                <th className="px-5 py-3 font-medium">金额</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-[#F0F0F8] last:border-0">
                  <td className="px-5 py-3 text-xs text-[#8B8B9A]">
                    {new Date(inv.issuedAt ?? inv.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-5 py-3 text-[#1A1A2E]">{inv.plan ? (PLAN_LABEL[inv.plan] ?? inv.plan) : '-'}</td>
                  <td className="px-5 py-3 font-medium text-[#1A1A2E]">
                    {(inv.amount / 100).toFixed(2)} {inv.currency?.toUpperCase()}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        inv.status === 'PAID' || inv.status === 'paid'
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-amber-50 text-amber-600'
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
