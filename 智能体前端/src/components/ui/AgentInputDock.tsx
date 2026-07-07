import { useState } from 'react';
import {
  SendHorizonal,
  Search,
  Globe,
  Upload,
  Image,
  Sparkles,
} from 'lucide-react';

interface AgentInputDockProps {
  placeholder?: string;
  onSendMessage?: (message: string) => void;
  onUploadFile?: () => void;
  extraButtons?: React.ReactNode[];
  value?: string;
  onValueChange?: (value: string) => void;
}

const noop = () => console.log('TODO: 接入智能体');

function AgentInputDock({
  placeholder = '输入指令，让 AI 帮你完成工作...',
  onSendMessage = noop,
  onUploadFile = noop,
  extraButtons,
  value: controlledValue,
  onValueChange,
  ...rest
}: AgentInputDockProps & Record<string, unknown>) {
  const [internalInput, setInternalInput] = useState('');

  const isControlled = controlledValue !== undefined;
  const input = isControlled ? controlledValue : internalInput;

  const setInput = (val: string) => {
    if (isControlled) {
      onValueChange?.(val);
    } else {
      setInternalInput(val);
    }
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const defaultActions: { icon: React.ReactNode; label: string; onClick: () => void }[] = [
    { icon: <Search size={16} />, label: '深度研究', onClick: noop },
    { icon: <Globe size={16} />, label: '联网搜索', onClick: noop },
    { icon: <Upload size={16} />, label: '上传文件', onClick: onUploadFile },
    { icon: <Image size={16} />, label: '生成图片', onClick: noop },
    { icon: <Sparkles size={16} />, label: '智能体', onClick: noop },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#E8E8F0] bg-white p-4 shadow-sm" {...rest}>
      {/* Extra buttons row (above input) */}
      {(extraButtons && extraButtons.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {extraButtons}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] px-4 py-2.5 pr-3 text-sm text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF] focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF]"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          data-testid="agent-send-btn"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#6C63FF] text-white transition-colors hover:bg-[#5A52D5] disabled:opacity-40 disabled:hover:bg-[#6C63FF]"
        >
          <SendHorizonal size={18} />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2">
        {defaultActions.map((action) => (
          <button
            key={action.label}
            onClick={action.onClick}
            title={action.label}
            className="flex items-center gap-1.5 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#6B7280] transition-colors hover:border-[#6C63FF] hover:bg-[#F0EEFF] hover:text-[#6C63FF]"
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default AgentInputDock;
