import { useState, useEffect, useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Bot, Plus, Folder, BookOpen, Users, CheckCircle, ArrowUpRight, SendHorizonal, GitBranch, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import RobotIllustration from '../components/ui/RobotIllustration';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/use-toast.ts';
import { promptsApi } from '../api/prompts';
import { tasksApi } from '../api/tasks';
import { createAgentRun, waitForAgentRun } from '../api/agentRuns';
import { knowledgeBaseApi } from '../api/knowledge-base';
import { sopsApi } from '../api/sops';
import { filesApi } from '../api/files';
import { workspacesApi } from '../api/workspaces';
import { organizationsApi } from '../api/organizations';
import type { PromptTemplate } from '../api/prompts';
import type { Task } from '../api/tasks';
import type { KnowledgeDocument } from '../api/knowledge-base';
import type { Sop } from '../api/sops';
import type { FileAsset } from '../api/files';
import type { WorkspaceSummary } from '../api/workspaces';
import type { OrganizationMember } from '../api/organizations';
import {
  executionStatusLabel,
  organizationRoleLabel,
} from '../utils/customer-facing-language';

interface AssistantAgentOutput {
  reply?: string;
  response?: string;
}

type DetailModal = 'knowledge' | 'sops' | 'members' | 'files' | 'workspaces';

const channelLabelMap: Record<string, string> = {
  AMAZON_US: 'Amazon US',
  AMAZON_EU: 'Amazon EU',
  AMAZON_JP: 'Amazon JP',
  AMAZON_AU: 'Amazon AU',
  SHOPIFY: 'Shopify',
  WOOCOMMERCE: 'WooCommerce',
  OZON: 'Ozon',
  MANUAL: '手动工作区',
};

function getErrorMessage(err: unknown) {
  return err instanceof Error ? err.message : '接口调用失败';
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function TeamCollaboration() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [newPromptModalOpen, setNewPromptModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<DetailModal | null>(null);
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // API state
  const [promptItems, setPromptItems] = useState<PromptTemplate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [knowledgeDocs, setKnowledgeDocs] = useState<KnowledgeDocument[]>([]);
  const [sopItems, setSopItems] = useState<Sop[]>([]);
  const [fileItems, setFileItems] = useState<FileAsset[]>([]);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [dataErrors, setDataErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      const nextErrors: Record<string, string> = {};
      const [
        promptsRes,
        tasksRes,
        knowledgeRes,
        sopsRes,
        filesRes,
        membersRes,
        workspacesRes,
      ] = await Promise.allSettled([
        promptsApi.list(),
        tasksApi.list(),
        knowledgeBaseApi.list({ limit: 20 }),
        sopsApi.list({ limit: 20 }),
        filesApi.list({ limit: 20 }),
        organizationsApi.listMembers({ limit: 20 }),
        workspacesApi.list({ limit: 20 }),
      ]);

      if (cancelled) return;

      if (promptsRes.status === 'fulfilled') {
        setPromptItems(promptsRes.value.items);
      } else {
        nextErrors.prompts = getErrorMessage(promptsRes.reason);
      }
      if (tasksRes.status === 'fulfilled') {
        setTasks(tasksRes.value.items);
      } else {
        nextErrors.tasks = getErrorMessage(tasksRes.reason);
      }
      if (knowledgeRes.status === 'fulfilled') {
        setKnowledgeDocs(knowledgeRes.value.items);
      } else {
        nextErrors.knowledge = getErrorMessage(knowledgeRes.reason);
      }
      if (sopsRes.status === 'fulfilled') {
        setSopItems(sopsRes.value.items);
      } else {
        nextErrors.sops = getErrorMessage(sopsRes.reason);
      }
      if (filesRes.status === 'fulfilled') {
        setFileItems(filesRes.value.items);
      } else {
        nextErrors.files = getErrorMessage(filesRes.reason);
      }
      if (membersRes.status === 'fulfilled') {
        setMembers(membersRes.value.items);
      } else {
        nextErrors.members = getErrorMessage(membersRes.reason);
      }
      if (workspacesRes.status === 'fulfilled') {
        setWorkspaces(workspacesRes.value.items);
      } else {
        nextErrors.workspaces = getErrorMessage(workspacesRes.reason);
      }

      setDataErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        const importantErrors = ['prompts', 'tasks', 'knowledge', 'sops', 'files', 'workspaces']
          .filter((key) => nextErrors[key])
          .map((key) => nextErrors[key]);
        if (importantErrors.length > 0) {
          addToast(`团队页部分真实接口加载失败：${importantErrors[0]}`, 'error');
        }
      }
      setLoading(false);
    }
    fetchData();
    return () => { cancelled = true; };
  }, [addToast]);

  const quickPrompts = useMemo(() => [
    t('team.quickPrompt1'),
    t('team.quickPrompt2'),
    t('team.quickPrompt3'),
    t('team.quickPrompt4'),
  ], [t]);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'ACTIVE'),
    [members],
  );

  const teamAvatars = useMemo(
    () =>
      activeMembers.slice(0, 4).map((member) => {
        const name = member.user.name || member.user.email || '?';
        return name.charAt(0).toUpperCase();
      }),
    [activeMembers],
  );

  const latestMember = activeMembers.at(-1);

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    try {
      const created = await createAgentRun<AssistantAgentOutput>('GENERAL_ASSISTANT', {
        assistantId: 'team-collaboration',
        prompt: trimmed,
      });
      const completed =
        created.status === 'COMPLETED'
          ? created
          : await waitForAgentRun<AssistantAgentOutput>(created.id);
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          text:
            completed.output?.reply ??
            completed.output?.response ??
            '智能体已完成，但没有返回可展示内容。',
        },
      ]);
    } catch (err: any) {
      addToast(err?.message ?? '团队智能体调用失败', 'error');
      setMessages((prev) => [
        ...prev,
        { role: 'ai', text: '团队智能体调用失败，页面没有生成本地假回复。' },
      ]);
    }
  };

  const handleCreatePrompt = async () => {
    if (!newPromptTitle.trim() || !newPromptContent.trim()) {
      addToast(t('team.promptTitleRequired'), 'warning');
      return;
    }
    try {
      const created = await promptsApi.create({
        title: newPromptTitle.trim(),
        content: newPromptContent.trim(),
        category: 'general',
        isStarred: false,
      });
      setPromptItems((prev) => [...prev, created]);
      addToast(t('team.promptCreated', { title: newPromptTitle }), 'success');
      setNewPromptModalOpen(false);
      setNewPromptTitle('');
      setNewPromptContent('');
    } catch (err: any) {
      addToast(err?.message ?? t('team.promptCreateFailed'), 'error');
    }
  };

  const handleFileInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type) {
      addToast('后端文件上传要求明确 MIME 类型，已拒绝空类型文件。', 'error');
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      addToast('文件超过 12MB 后端限制，未上传。', 'error');
      return;
    }

    setUploading(true);
    try {
      const dataBase64 = await readFileAsDataUrl(file);
      const uploaded = await filesApi.upload({
        filename: file.name,
        mimeType: file.type,
        dataBase64,
        purpose: 'KNOWLEDGE_DOC',
      });
      setFileItems((prev) => [uploaded, ...prev]);
      addToast(`文件已真实上传到后端：${uploaded.filename}`, 'success');
    } catch (err) {
      addToast(`文件上传失败：${getErrorMessage(err)}`, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Map API task data to the render shape — keep priorityKey for color logic, priorityLabel for display
  const displayTasks = useMemo(() => tasks.map((task) => ({
    name: task.title,
    priorityKey: task.priority,
    priorityLabel: task.priority === 'high' ? t('team.priorityHigh') : task.priority === 'medium' ? t('team.priorityMedium') : t('team.priorityLow'),
    assignee: task.assignee,
  })), [tasks, t]);

  const renderDetailModal = () => {
    if (!detailModal) return null;
    if (detailModal === 'knowledge') {
      return (
        <div className="space-y-2">
          {dataErrors.knowledge ? <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{dataErrors.knowledge}</div> : null}
          {knowledgeDocs.length > 0 ? knowledgeDocs.map((doc) => (
            <div key={doc.id} className="rounded-lg border border-[#E8E8F0] p-3">
              <p className="text-sm font-medium text-[#1A1A2E]">{doc.title}</p>
              <p className="mt-1 line-clamp-2 text-xs text-[#8B93B5]">{doc.content}</p>
              <p className="mt-2 text-[10px] text-[#8B93B5]">{doc.createdAt.slice(0, 10)} · {doc.visibility}</p>
            </div>
          )) : <div className="rounded-lg border border-dashed border-[#E8E8F0] p-6 text-center text-xs text-[#8B93B5]">暂无真实知识库文档。</div>}
        </div>
      );
    }
    if (detailModal === 'sops') {
      return (
        <div className="space-y-2">
          {dataErrors.sops ? <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{dataErrors.sops}</div> : null}
          {sopItems.length > 0 ? sopItems.map((sop) => (
            <div key={sop.id} className="rounded-lg border border-[#E8E8F0] p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-[#1A1A2E]">{sop.title}</p>
                <span className="rounded bg-[#F0EEFF] px-1.5 py-0.5 text-[10px] text-[#6C63FF]">{executionStatusLabel(sop.status)}</span>
              </div>
              <p className="mt-1 text-xs text-[#8B93B5]">{sop.description || '无描述'}</p>
            </div>
          )) : <div className="rounded-lg border border-dashed border-[#E8E8F0] p-6 text-center text-xs text-[#8B93B5]">暂无真实 SOP。</div>}
        </div>
      );
    }
    if (detailModal === 'files') {
      return (
        <div className="space-y-2">
          {dataErrors.files ? <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{dataErrors.files}</div> : null}
          {fileItems.length > 0 ? fileItems.map((file) => (
            <div key={file.id} className="flex items-center justify-between rounded-lg border border-[#E8E8F0] p-3">
              <div>
                <p className="text-sm font-medium text-[#1A1A2E]">{file.filename}</p>
                <p className="text-xs text-[#8B93B5]">{file.mimeType} · {(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <span className="text-[10px] text-[#8B93B5]">{file.purpose}</span>
            </div>
          )) : <div className="rounded-lg border border-dashed border-[#E8E8F0] p-6 text-center text-xs text-[#8B93B5]">暂无真实文件资产。</div>}
        </div>
      );
    }
    if (detailModal === 'members') {
      return (
        <div className="space-y-2">
          {dataErrors.members ? <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{dataErrors.members}</div> : null}
          {members.length > 0 ? members.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-lg border border-[#E8E8F0] p-3">
              <div>
                <p className="text-sm font-medium text-[#1A1A2E]">{member.user.name || member.user.email}</p>
                <p className="text-xs text-[#8B93B5]">{member.user.email}</p>
              </div>
              <span className="rounded bg-[#F8F9FF] px-2 py-0.5 text-[10px] text-[#4A5578]">{organizationRoleLabel(member.role)} · {executionStatusLabel(member.status)}</span>
            </div>
          )) : <div className="rounded-lg border border-dashed border-[#E8E8F0] p-6 text-center text-xs text-[#8B93B5]">暂无可见成员样本或当前账号无成员列表权限。</div>}
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {dataErrors.workspaces ? <div className="rounded-lg bg-red-50 p-3 text-xs text-red-600">{dataErrors.workspaces}</div> : null}
        {workspaces.length > 0 ? workspaces.map((workspace) => (
          <div key={workspace.id} className="rounded-lg border border-[#E8E8F0] p-3">
            <p className="text-sm font-medium text-[#1A1A2E]">{workspace.name}</p>
            <p className="text-xs text-[#8B93B5]">{channelLabelMap[workspace.channelType] ?? '其他平台'} · {executionStatusLabel(workspace.status)}</p>
          </div>
        )) : <div className="rounded-lg border border-dashed border-[#E8E8F0] p-6 text-center text-xs text-[#8B93B5]">暂无真实工作区。</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="relative flex items-center justify-between rounded-2xl bg-gradient-to-br from-[#FFF5F5] via-[#F5F0FF] to-[#F0F5FF] px-8 py-7 overflow-hidden" style={{ minHeight: '180px' }}>
        <div className="z-10">
          <h2 className="text-2xl font-bold text-[#1A1A2E]">{t('team.welcome', { name: 'Olivia' })} 👋</h2>
          <p className="mt-1 text-sm text-[#6B7280]">{t('team.welcomeDesc')}</p>
        </div>
        <div className="z-10 relative">
          <RobotIllustration size="lg" variant="welcome" />
          {/* Floating labels */}
          <div className="absolute -top-1 -right-8 bg-white rounded-full px-2 py-0.5 shadow-sm border border-[#E8E8F0] text-[10px] font-medium text-[#6C63FF] whitespace-nowrap flex items-center gap-0.5">
            <Plus size={10} /> 知识库 {knowledgeDocs.length} 项
          </div>
          <div className="absolute top-6 -left-10 bg-white rounded-full px-2 py-0.5 shadow-sm border border-[#E8E8F0] text-[10px] font-medium text-[#34D399] whitespace-nowrap flex items-center gap-0.5">
            <Plus size={10} /> SOP {sopItems.length} 项
          </div>
          <div className="absolute -bottom-1 -right-6 bg-white rounded-full px-2 py-0.5 shadow-sm border border-[#E8E8F0] text-[10px] font-medium text-[#FB923C] whitespace-nowrap flex items-center gap-0.5">
            <Plus size={10} /> 任务 {tasks.length} 项
          </div>
        </div>
        <div className="absolute right-40 top-0 h-40 w-40 rounded-full bg-[#6C63FF]/5 blur-3xl" />
      </div>

      {/* Main: 70/30 split */}
      <div className="grid grid-cols-12 gap-5">
        {/* Left: AI Team Assistant */}
        <div className="col-span-8">
          <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm" style={{ minHeight: '300px' }}>
            <div className="flex items-center justify-between border-b border-[#E8E8F0] px-5 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6C63FF] text-white">
                  <Bot size={16} />
                </div>
                <span className="text-sm font-semibold text-[#1A1A2E]">{t('team.aiTeamAssistant')}</span>
                <span className="text-[10px] font-semibold text-white bg-gradient-to-r from-[#6C63FF] to-[#8B7CFF] px-1.5 py-0.5 rounded-md">{t('team.proTag')}</span>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {/* Quick prompts */}
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    data-testid={`quick-prompt-${prompt.slice(0, 6)}`}
                    className="rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:bg-[#F0EEFF] hover:text-[#6C63FF] transition-colors"
                    onClick={() => handleQuickPrompt(prompt)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Messages area */}
              {messages.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto border border-[#E8E8F0] rounded-xl p-3 bg-[#F8F9FF]">
                  {messages.map((msg, i) => (
                    <div key={i} data-testid={`message-${i}`} className={`flex gap-2 text-xs ${msg.role === 'user' ? '' : ''}`}>
                      <span className={`shrink-0 font-medium ${msg.role === 'user' ? 'text-[#6C63FF]' : 'text-[#34D399]'}`}>
                        {msg.role === 'user' ? '👤' : '🤖'}
                      </span>
                      <span className="text-[#4A5578]">{msg.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Input area */}
              <div className="relative">
                <input
                  data-testid="team-input"
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                  placeholder={t('team.inputPlaceholder')}
                  className="w-full rounded-xl border border-[#E8E8F0] bg-[#F8F9FF] px-4 py-3 pr-14 text-sm text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF] focus:border-[#6C63FF]"
                />
                <button
                  data-testid="team-send-btn"
                  onClick={handleSend}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-lg bg-[#6C63FF] text-white hover:bg-[#5A52D5] transition-colors"
                >
                  <SendHorizonal size={18} />
                </button>
              </div>

              {/* Bottom buttons */}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(event) => void handleFileInputChange(event)}
              />
              <div className="flex items-center gap-2">
                <button data-testid="btn-knowledge" className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors" onClick={() => setDetailModal('knowledge')}>
                  <BookOpen size={14} /> {t('team.knowledgeBase')}
                </button>
                <button data-testid="btn-sop" className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors" onClick={() => setDetailModal('sops')}>
                  <GitBranch size={14} /> {t('team.sop')}
                </button>
                <button data-testid="btn-team-data" className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors" onClick={() => setDetailModal('members')}>
                  <Users size={14} /> {t('team.teamData')}
                </button>
                <button
                  data-testid="btn-upload"
                  disabled={uploading}
                  className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload size={14} /> {uploading ? '上传中' : t('team.uploadFile')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: My Prompts */}
        <div className="col-span-4">
          <div className="rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E8F0] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#1A1A2E]">{t('team.myPrompts')}</h3>
              <button
                data-testid="new-prompt-btn"
                onClick={() => setNewPromptModalOpen(true)}
                className="flex items-center gap-0.5 text-xs text-[#6C63FF] hover:underline"
              >
                <Plus size={12} /> {t('team.newPrompt')}
              </button>
            </div>
            <div className="divide-y divide-[#F0F0F8]">
              {loading ? (
                <div className="px-4 py-6 text-center text-xs text-[#8B93B5]">{t('common.loading')}</div>
              ) : promptItems.length > 0 ? (
                promptItems.map((p) => (
                  <div key={p.id} data-testid={`prompt-item-${p.id}`} className="px-4 py-2.5 hover:bg-[#F8F9FF] cursor-pointer">
                    <p className="text-sm text-[#1A1A2E]">{p.title}</p>
                    <p className="text-xs text-[#8B93B5] mt-0.5 truncate">{p.content}</p>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-center text-xs text-[#8B93B5]">暂无真实提示词模板。</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Four cards row */}
      <div className="grid grid-cols-4 gap-5">
        {/* Knowledge Base */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#F0EEFF] text-[#6C63FF]">
                <Folder size={16} />
              </div>
              <span className="text-sm font-semibold text-[#1A1A2E]">{t('team.knowledgeTitle')}</span>
            </div>
          </div>
          <div className="space-y-2">
            {dataErrors.knowledge ? (
              <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{dataErrors.knowledge}</div>
            ) : knowledgeDocs.length > 0 ? (
              knowledgeDocs.slice(0, 4).map((doc) => (
              <div key={doc.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-[#4A5578]">{doc.title}</span>
                <span className="shrink-0 text-[#8B93B5]">{doc.createdAt.slice(0, 10)}</span>
              </div>
              ))
            ) : (
              <div className="text-xs text-[#8B93B5]">暂无真实知识库文档。</div>
            )}
          </div>
          <button data-testid="view-all-knowledge" onClick={() => setDetailModal('knowledge')} className="mt-3 w-full rounded-lg border border-[#E8E8F0] py-1.5 text-xs text-[#6C63FF] hover:bg-[#F0EEFF] transition-colors">
            {t('team.viewAllKnowledge')}
          </button>
        </div>

        {/* SOP */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#34D399]/10 text-[#34D399]">
                <GitBranch size={16} />
              </div>
              <span className="text-sm font-semibold text-[#1A1A2E]">{t('team.sopTitle')}</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {dataErrors.sops ? (
              <div className="rounded-lg bg-red-50 p-2 text-xs text-red-600">{dataErrors.sops}</div>
            ) : sopItems.length > 0 ? (
              sopItems.slice(0, 4).map((sop) => (
              <div key={sop.id} className="flex items-center justify-between gap-2">
                <span className="truncate text-xs text-[#4A5578]">{sop.title}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${sop.status === 'PUBLISHED' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#FB923C]/10 text-[#FB923C]'}`}>
                  {executionStatusLabel(sop.status)}
                </span>
              </div>
              ))
            ) : (
              <div className="text-xs text-[#8B93B5]">暂无真实 SOP。</div>
            )}
          </div>
        </div>

        {/* Team Activity */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FB923C]/10 text-[#FB923C]">
                <Users size={16} />
              </div>
              <span className="text-sm font-semibold text-[#1A1A2E]">{t('team.teamActivity')}</span>
            </div>
          </div>
          <div className="flex items-center mb-3">
            <div className="flex -space-x-1.5">
              {teamAvatars.length > 0 ? teamAvatars.map((a, i) => (
                <div key={i} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#6C63FF] to-[#8B7CFF] text-[9px] font-bold text-white">
                  {a}
                </div>
              )) : (
                <div className="text-xs text-[#8B93B5]">无成员样本</div>
              )}
            </div>
            <span className="text-xs text-[#8B93B5] ml-2">活跃成员 {activeMembers.length}</span>
          </div>
          <p className="text-xs text-[#8B93B5]">
            {latestMember ? `最近成员：${latestMember.user.name || latestMember.user.email}` : (dataErrors.members || '暂无成员活动样本。')}
          </p>
        </div>

        {/* Task Management */}
        <div className="rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FF6B9D]/10 text-[#FF6B9D]">
                <CheckCircle size={16} />
              </div>
              <span className="text-sm font-semibold text-[#1A1A2E]">{t('team.taskManagement')}</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {loading ? (
              <div className="text-xs text-[#8B93B5] text-center py-2">{t('common.loading')}</div>
            ) : displayTasks.length > 0 ? (
              displayTasks.map((task) => (
                <div key={task.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${
                      task.priorityKey === 'high' ? 'bg-[#FF5A6A]' : task.priorityKey === 'medium' ? 'bg-[#FFB020]' : 'bg-[#34D399]'
                    }`} />
                    <span className="text-xs text-[#4A5578] truncate max-w-[100px]">{task.name}</span>
                  </div>
                  <span className="text-[10px] text-[#8B93B5]">{task.assignee}</span>
                </div>
              ))
            ) : (
              <div className="text-xs text-[#8B93B5] text-center py-2">暂无真实团队任务。</div>
            )}
          </div>
        </div>
      </div>

      {/* Project Spaces */}
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A2E] mb-3">{t('team.recentProjects')}</h3>
        <div className="grid grid-cols-4 gap-5">
          {workspaces.length > 0 ? workspaces.map((space) => (
            <button key={space.id} className="flex items-center gap-3 rounded-xl border border-[#E8E8F0] bg-white p-4 text-left shadow-sm hover:border-[#6C63FF] transition-colors" onClick={() => setDetailModal('workspaces')}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#6C63FF] text-sm font-bold text-white">
                {space.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1A1A2E] truncate">{space.name}</p>
                <p className="text-xs text-[#8B93B5]">{channelLabelMap[space.channelType] ?? space.channelType}</p>
              </div>
              <ArrowUpRight size={14} className="text-[#8B93B5]" />
            </button>
          )) : (
            <div className="col-span-4 rounded-xl border border-dashed border-[#E8E8F0] bg-white p-6 text-center text-xs text-[#8B93B5]">
              {dataErrors.workspaces || '暂无真实工作区。'}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={detailModal !== null}
        onClose={() => setDetailModal(null)}
        title={
          detailModal === 'knowledge'
            ? t('team.knowledgeBase')
            : detailModal === 'sops'
            ? t('team.sop')
            : detailModal === 'members'
            ? t('team.teamData')
            : detailModal === 'files'
            ? t('team.uploadFile')
            : t('team.recentProjects')
        }
        width="max-w-2xl"
      >
        {renderDetailModal()}
      </Modal>

      {/* New Prompt Modal */}
      <Modal open={newPromptModalOpen} onClose={() => setNewPromptModalOpen(false)} title={t('team.newPromptTitle')}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#4A5578] mb-1">{t('team.promptTitle')}</label>
            <input
              data-testid="new-prompt-title"
              type="text"
              value={newPromptTitle}
              onChange={(e) => setNewPromptTitle(e.target.value)}
              placeholder={t('team.promptTitlePlaceholder')}
              className="w-full rounded-lg border border-[#E8E8F0] px-3 py-2 text-xs text-[#1A1A2E] outline-none focus:border-[#6C63FF]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#4A5578] mb-1">{t('team.promptContent')}</label>
            <textarea
              data-testid="new-prompt-content"
              value={newPromptContent}
              onChange={(e) => setNewPromptContent(e.target.value)}
              placeholder={t('team.promptContentPlaceholder')}
              rows={6}
              className="w-full rounded-lg border border-[#E8E8F0] px-3 py-2 text-xs text-[#1A1A2E] outline-none focus:border-[#6C63FF] resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setNewPromptModalOpen(false)} className="rounded-lg border border-[#E8E8F0] px-4 py-2 text-xs text-[#4A5578] hover:bg-[#F8F9FF] transition-colors">
              {t('common.cancel')}
            </button>
            <button
              data-testid="create-prompt-confirm"
              onClick={handleCreatePrompt}
              className="rounded-lg bg-[#6C63FF] px-4 py-2 text-xs text-white hover:bg-[#5A52D5] transition-colors"
            >
              {t('common.create')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default TeamCollaboration;
