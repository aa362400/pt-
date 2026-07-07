import { useState, useEffect, useMemo } from 'react';
import { Bot, Plus, Folder, BookOpen, Users, CheckCircle, ArrowUpRight, SendHorizonal, GitBranch, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import RobotIllustration from '../components/ui/RobotIllustration';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/ui/use-toast.ts';
import { promptsApi } from '../api/prompts';
import { tasksApi } from '../api/tasks';
import type { PromptTemplate } from '../api/prompts';
import type { Task } from '../api/tasks';

function TeamCollaboration() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [newPromptModalOpen, setNewPromptModalOpen] = useState(false);
  const [newPromptTitle, setNewPromptTitle] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const { addToast } = useToast();

  // API state
  const [promptItems, setPromptItems] = useState<PromptTemplate[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        const [promptsRes, tasksRes] = await Promise.all([
          promptsApi.list(),
          tasksApi.list(),
        ]);
        if (cancelled) return;
        setPromptItems(promptsRes.items);
        setTasks(tasksRes.items);
      } catch (err: any) {
        if (!cancelled) {
          addToast(err?.message ?? t('error.loadFailed'), 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  const quickPrompts = useMemo(() => [
    t('team.quickPrompt1'),
    t('team.quickPrompt2'),
    t('team.quickPrompt3'),
    t('team.quickPrompt4'),
  ], [t]);

  const knowledgeFolders = useMemo(() => [
    { nameKey: 'knowledge.opsDocs', count: 24 },
    { nameKey: 'knowledge.marketAnalysis', count: 18 },
    { nameKey: 'knowledge.productMaterials', count: 32 },
    { nameKey: 'knowledge.trainingMaterials', count: 15 },
  ], []);

  const sopList = useMemo(() => [
    { nameKey: 'sop.newListing', statusKey: 'published' as const },
    { nameKey: 'sop.adOptimization', statusKey: 'published' as const },
    { nameKey: 'sop.returnProcess', statusKey: 'draft' as const },
  ], []);

  const projectSpaces = useMemo(() => [
    { id: 'proj1', nameKey: 'team.projectName1', platform: 'Amazon', icon: '🛒', memberCount: 4 },
    { id: 'proj2', nameKey: 'team.projectName2', platform: 'TikTok Shop', icon: '🎵', memberCount: 3 },
    { id: 'proj3', nameKey: 'team.projectName3', platform: 'Temu', icon: '🛍️', memberCount: 2 },
    { id: 'proj4', nameKey: 'team.projectName4', platform: 'Etsy', icon: '🏪', memberCount: 2 },
    { id: 'proj5', nameKey: 'team.projectName5', platform: '独立站', icon: '🌐', memberCount: 3 },
    { id: 'proj6', nameKey: 'team.projectName6', platform: '内部', icon: '🤖', memberCount: 5 },
  ], []);

  const teamAvatars = ['A', 'B', 'C', 'D'];

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: trimmed },
      { role: 'ai', text: t('team.aiResponse', { query: trimmed }) },
    ]);
    setInput('');
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

  // Map API task data to the render shape — keep priorityKey for color logic, priorityLabel for display
  const displayTasks = useMemo(() => tasks.map((task) => ({
    name: task.title,
    priorityKey: task.priority,
    priorityLabel: task.priority === 'high' ? t('team.priorityHigh') : task.priority === 'medium' ? t('team.priorityMedium') : t('team.priorityLow'),
    assignee: task.assignee,
  })), [tasks, t]);

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
            <Plus size={10} /> {t('team.knowledgeUpdated')}
          </div>
          <div className="absolute top-6 -left-10 bg-white rounded-full px-2 py-0.5 shadow-sm border border-[#E8E8F0] text-[10px] font-medium text-[#34D399] whitespace-nowrap flex items-center gap-0.5">
            <Plus size={10} /> {t('team.newSopOnline')}
          </div>
          <div className="absolute -bottom-1 -right-6 bg-white rounded-full px-2 py-0.5 shadow-sm border border-[#E8E8F0] text-[10px] font-medium text-[#FB923C] whitespace-nowrap flex items-center gap-0.5">
            <Plus size={10} /> {t('team.taskCompleted')}
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
              <div className="flex items-center gap-2">
                <button data-testid="btn-knowledge" className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors" onClick={() => addToast(t('team.openingKnowledgeBase'), 'info')}>
                  <BookOpen size={14} /> {t('team.knowledgeBase')}
                </button>
                <button data-testid="btn-sop" className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors" onClick={() => addToast(t('team.openingSop'), 'info')}>
                  <GitBranch size={14} /> {t('team.sop')}
                </button>
                <button data-testid="btn-team-data" className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors" onClick={() => addToast(t('team.loadingTeamData'), 'info')}>
                  <Users size={14} /> {t('team.teamData')}
                </button>
                <button data-testid="btn-upload" className="flex items-center gap-1 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#4A5578] hover:border-[#6C63FF] hover:text-[#6C63FF] transition-colors" onClick={() => addToast(t('team.selectFile'), 'info')}>
                  <Upload size={14} /> {t('team.uploadFile')}
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
              ) : (
                promptItems.map((p) => (
                  <div key={p.id} data-testid={`prompt-item-${p.id}`} className="px-4 py-2.5 hover:bg-[#F8F9FF] cursor-pointer">
                    <p className="text-sm text-[#1A1A2E]">{p.title}</p>
                    <p className="text-xs text-[#8B93B5] mt-0.5 truncate">{p.content}</p>
                  </div>
                ))
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
            {knowledgeFolders.map((f) => (
              <div key={f.nameKey} className="flex items-center justify-between text-xs">
                <span className="text-[#4A5578]">{t(f.nameKey)}</span>
                <span className="text-[#8B93B5]">{t('team.fileCount', { count: f.count })}</span>
              </div>
            ))}
          </div>
          <button data-testid="view-all-knowledge" onClick={() => addToast(t('team.viewAllKnowledgeLoading'), 'info')} className="mt-3 w-full rounded-lg border border-[#E8E8F0] py-1.5 text-xs text-[#6C63FF] hover:bg-[#F0EEFF] transition-colors">
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
            {sopList.map((sop) => (
              <div key={sop.nameKey} className="flex items-center justify-between">
                <span className="text-xs text-[#4A5578]">{t(sop.nameKey)}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${sop.statusKey === 'published' ? 'bg-[#34D399]/10 text-[#34D399]' : 'bg-[#FB923C]/10 text-[#FB923C]'}`}>
                  {sop.statusKey === 'published' ? t('team.statusPublished') : t('team.statusDraft')}
                </span>
              </div>
            ))}
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
              {teamAvatars.map((a, i) => (
                <div key={i} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-[#6C63FF] to-[#8B7CFF] text-[9px] font-bold text-white">
                  {a}
                </div>
              ))}
            </div>
            <span className="text-xs text-[#8B93B5] ml-2">{t('team.peopleOnline', { count: 4 })}</span>
          </div>
          <p className="text-xs text-[#8B93B5]">{t('time.minutesAgo', { minutes: 2 })}</p>
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
            ) : (
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
            )}
          </div>
        </div>
      </div>

      {/* Project Spaces */}
      <div>
        <h3 className="text-sm font-semibold text-[#1A1A2E] mb-3">{t('team.recentProjects')}</h3>
        <div className="grid grid-cols-4 gap-5">
          {projectSpaces.map((space) => (
            <div key={space.id} className="flex items-center gap-3 rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm hover:border-[#6C63FF] transition-colors cursor-pointer">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white ${
                space.platform === 'Etsy' ? 'bg-[#F56400]' : space.platform === 'Amazon' ? 'bg-[#232F3E]' : space.platform === 'Temu' ? 'bg-[#FF6A00]' : 'bg-[#6C63FF]'
              }`}>
                {space.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[#1A1A2E] truncate">{t(space.nameKey)}</p>
                <p className="text-xs text-[#8B93B5]">{t('team.memberCount', { count: space.memberCount })}</p>
              </div>
              <ArrowUpRight size={14} className="text-[#8B93B5]" />
            </div>
          ))}
        </div>
      </div>

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
