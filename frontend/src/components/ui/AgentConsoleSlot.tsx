import { Bot, Command } from 'lucide-react';
import { useState } from 'react';

interface AgentConsoleSlotProps {
  quickCommands?: string[];
  onCommand?: (command: string) => void;
  connectionState?: 'ready' | 'running' | 'unconfigured';
}

const defaultCommands = [
  'textgenerationenglish_text',
  'english_text 7 english_text',
  'english_text Listing',
  'english_textsyncstatus',
];

const connectionConfig = {
  ready: {
    label: 'realAPI',
    className: 'bg-[#4A9EFF]/10 text-[#2563EB]',
    dot: 'bg-[#4A9EFF]',
  },
  running: {
    label: 'english_text',
    className: 'bg-[#FB923C]/10 text-[#EA580C]',
    dot: 'bg-[#FB923C]',
  },
  unconfigured: {
    label: 'english_text',
    className: 'bg-[#9CA3AF]/10 text-[#6B7280]',
    dot: 'bg-[#9CA3AF]',
  },
} as const;

function AgentConsoleSlot({
  quickCommands = defaultCommands,
  onCommand,
  connectionState,
}: AgentConsoleSlotProps) {
  const [input, setInput] = useState('');
  const resolvedState = connectionState ?? (onCommand ? 'ready' : 'unconfigured');
  const connection = connectionConfig[resolvedState];

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onCommand?.(trimmed);
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
          <span className="text-sm font-semibold text-[#1A1A2E]">Agent english_text</span>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${connection.className}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${connection.dot}`} />
          {connection.label}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-4 text-sm leading-relaxed text-[#6B7280]">
          text Olivia 👋 english_texttask、english_textflow。
        </p>

        {/* Quick commands */}
        <div className="mb-4 space-y-2">
          <span className="flex items-center gap-1 text-xs font-medium text-[#9CA3AF]">
            <Command size={12} />
            english_text
          </span>
          <div className="flex flex-col gap-1.5">
            {quickCommands.map((cmd) => (
              <button
                key={cmd}
                onClick={() => onCommand?.(cmd)}
                disabled={!onCommand}
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
          placeholder="inputtext..."
          className="flex-1 rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] px-3 py-2 text-sm text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF] focus:border-[#6C63FF]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !onCommand}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6C63FF] text-white transition-colors hover:bg-[#5A52D5] disabled:opacity-40"
        >
          <Bot size={15} />
        </button>
      </div>
    </div>
  );
}

export default AgentConsoleSlot;
