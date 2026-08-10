import { useEffect, useState } from 'react';
import { Loader2, Save, SlidersHorizontal } from 'lucide-react';
import Modal from './Modal';
import { workspacesApi, type WorkspaceSummary } from '../../api/workspaces';
import {
  storeAgentProfilesApi,
  type StoreAgentProfile,
} from '../../api/storeAgentProfiles';
import { useToast } from './use-toast';

type ProfileForm = {
  targetCategories: string;
  forbiddenTerms: string;
  minimumProfitMargin: string;
  notes: string;
};

const EMPTY_FORM: ProfileForm = {
  targetCategories: '',
  forbiddenTerms: '',
  minimumProfitMargin: '',
  notes: '',
};

function toList(value: string): string[] {
  return [...new Set(
    value
      .split(/[\n,，]/)
      .map((item) => item.trim())
      .filter(Boolean),
  )];
}

function toForm(profile: StoreAgentProfile): ProfileForm {
  return {
    targetCategories: profile.targetCategories.join('\n'),
    forbiddenTerms: profile.forbiddenTerms.join('\n'),
    minimumProfitMargin:
      profile.minimumProfitMargin === null ? '' : String(profile.minimumProfitMargin),
    notes: profile.notes ?? '',
  };
}

export default function StoreAgentProfileModal() {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const workspaces = await workspacesApi.list({ limit: 100 });
        const ozonWorkspace = (workspaces.items ?? []).find(
          (item) => item.channelType === 'OZON' && item.status === 'ACTIVE',
        );
        if (!ozonWorkspace) {
          if (!cancelled) {
            setWorkspace(null);
            setForm(EMPTY_FORM);
          }
          return;
        }
        const profile = await storeAgentProfilesApi.get(ozonWorkspace.id);
        if (!cancelled) {
          setWorkspace(ozonWorkspace);
          setForm(toForm(profile));
        }
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'english_textfailed');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const save = async () => {
    if (!workspace || saving) return;
    const marginText = form.minimumProfitMargin.trim();
    const margin = marginText ? Number(marginText) : null;
    if (margin !== null && (!Number.isFinite(margin) || margin < 0 || margin > 100)) {
      addToast('textprofitenglish_textyes 0 text 100 english_text。', 'error');
      return;
    }
    setSaving(true);
    try {
      const profile = await storeAgentProfilesApi.update(workspace.id, {
        targetCategories: toList(form.targetCategories),
        forbiddenTerms: toList(form.forbiddenTerms),
        minimumProfitMargin: margin,
        notes: form.notes.trim() || null,
      });
      setForm(toForm(profile));
      addToast('storeenglish_text，english_text Ozon product researchtextreadenglish_text。', 'success');
      setOpen(false);
    } catch (cause) {
      addToast(cause instanceof Error ? cause.message : 'english_textfailed', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 border border-[#D8DCEB] bg-white px-3 py-2 text-xs font-semibold text-[#334155] transition-colors hover:border-[#6C63FF] hover:text-[#5B53D8]"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        english_text
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Ozon storeenglish_text" width="max-w-2xl">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[#64748B]">
            <Loader2 className="h-4 w-4 animate-spin" />
            textreadenglish_text Ozon store
          </div>
        ) : error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : !workspace ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            english_text Ozon store，noneenglish_text。
          </p>
        ) : (
          <div className="space-y-4">
            <div className="border-b border-[#E8E8F0] pb-3 text-sm text-[#475569]">
              textstore：<span className="font-semibold text-[#1A1A2E]">{workspace.name}</span>
            </div>
            <label className="block text-sm font-medium text-[#334155]">
              textcategory
              <textarea
                value={form.targetCategories}
                onChange={(event) => setForm((current) => ({ ...current, targetCategories: event.target.value }))}
                rows={3}
                placeholder="english_text，text：english_text"
                className="mt-1.5 w-full resize-y border border-[#D8DCEB] px-3 py-2 text-sm outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/15"
              />
            </label>
            <label className="block text-sm font-medium text-[#334155]">
              english_text
              <textarea
                value={form.forbiddenTerms}
                onChange={(event) => setForm((current) => ({ ...current, forbiddenTerms: event.target.value }))}
                rows={3}
                placeholder="english_text，text：text、english_text"
                className="mt-1.5 w-full resize-y border border-[#D8DCEB] px-3 py-2 text-sm outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/15"
              />
            </label>
            <label className="block text-sm font-medium text-[#334155]">
              textprofittext（%）
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={form.minimumProfitMargin}
                onChange={(event) => setForm((current) => ({ ...current, minimumProfitMargin: event.target.value }))}
                className="mt-1.5 h-10 w-full border border-[#D8DCEB] px-3 text-sm outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/15"
              />
            </label>
            <label className="block text-sm font-medium text-[#334155]">
              storenotes
              <textarea
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                placeholder="text：english_text；costdataenglish_textprofittext。"
                className="mt-1.5 w-full resize-y border border-[#D8DCEB] px-3 py-2 text-sm outline-none focus:border-[#6C63FF] focus:ring-2 focus:ring-[#6C63FF]/15"
              />
            </label>
            <div className="flex justify-end border-t border-[#E8E8F0] pt-4">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex h-10 items-center gap-2 bg-[#5B53D8] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4C44C2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                english_text
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
