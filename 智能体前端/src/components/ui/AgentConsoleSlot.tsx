import { Bot, Command } from 'lucide-react';
import { useState } from 'react';

interface AgentConsoleSlotProps {
  quickCommands?: string[];
  onCommand?: (command: string) => void;
}

const noop = () => console.log('TODO: 接入智能体');

const defaultCommands = [
  '帮我生成明天的运营日报',
  '分析最近 7 天的销售趋势',
  '优化正在运行的 Listing',
  '检查库存同步状态',
];

function AgentConsoleSlot({
  quickCommands = defaultCommands,
  onCommand = noop,
}: AgentConsoleSlotProps) {
  const [input, setInput] = useState('');

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onCommand(trimmed);
    setInput('');
  };

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8E8F0] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6C63FF] text-white">
            <Bot size={16} />
          </div>
          <span className="text-sm font-semibold text-[#1A1A2E]">Agent 控制台</span>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[#34D399]/10 px-2.5 py-0.5 text-xs font-medium text-[#34D399]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#34D399]" />
          Agent 在线
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm leading-relaxed text-[#6B7280]">
          你好 Olivia 👋 我可以帮你执行任务、解答问题或优化流程。
        </p>

        {/* Quick commands */}
        <div className="mb-4 space-y-2">
          <span className="flex items-center gap-1 text-xs font-medium text-[#9CA3AF]">
            <Command size={12} />
            热门指令
          </span>
          <div className="flex flex-col gap-1.5">
            {quickCommands.map((cmd) => (
              <button
                key={cmd}
                onClick={() => onCommand(cmd)}
                className="rounded-lg border border-[#E8E8F0] px-3 py-2 text-left text-xs text-[#6B7280] transition-colors hover:border-[#6C63FF] hover:bg-[#F0EEFF] hover:text-[#6C63FF]"
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-[#E8E8F0] p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="输入指令..."
          className="flex-1 rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] px-3 py-2 text-sm text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF] focus:border-[#6C63FF]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6C63FF] text-white transition-colors hover:bg-[#5A52D5] disabled:opacity-40"
        >
          <Bot size={15} />
        </button>
      </div>
    </div>
  );
}

export default AgentConsoleSlot;
