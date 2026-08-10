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

function AgentInputDock({
  placeholder = 'inputtext，text AI textcompletedtext...',
  onSendMessage,
  onUploadFile,
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
    if (!trimmed || !onSendMessage) return;
    onSendMessage(trimmed);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const defaultActions: {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled: boolean;
    title: string;
  }[] = [
    { icon: <Search size={16} />, label: 'english_text', disabled: true, title: 'english_textrealenglish_textbackend' },
    { icon: <Globe size={16} />, label: 'textsearch', disabled: true, title: 'english_textrealtextsearchbackend' },
    {
      icon: <Upload size={16} />,
      label: 'textfile',
      onClick: onUploadFile,
      disabled: !onUploadFile,
      title: onUploadFile ? 'english_textrealbackend' : 'english_textrealfileenglish_text',
    },
    { icon: <Image size={16} />, label: 'generationimage', disabled: true, title: 'english_textrealgenerationflow' },
    { icon: <Sparkles size={16} />, label: 'agent', disabled: true, title: 'english_textrealagenttext' },
  ];
  const sendDisabled = !input.trim() || !onSendMessage;

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
          disabled={sendDisabled}
          data-testid="agent-send-btn"
          title={onSendMessage ? 'english_textrealagentAPI' : 'english_textrealagentenglish_text'}
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
            disabled={action.disabled}
            title={action.title}
            className="flex items-center gap-1.5 rounded-lg border border-[#E8E8F0] px-3 py-1.5 text-xs text-[#6B7280] transition-colors hover:border-[#6C63FF] hover:bg-[#F0EEFF] hover:text-[#6C63FF] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-[#E8E8F0] disabled:hover:bg-white disabled:hover:text-[#6B7280]"
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
