import { useState } from 'react';
import { SendHorizonal, Bot, User } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantPanelProps {
  title?: string;
  messages?: Message[];
  onSendMessage?: (message: string) => void;
}

function AssistantPanel({
  title = 'AI text',
  messages = [],
  onSendMessage,
}: AssistantPanelProps) {
  const [input, setInput] = useState('');
  const isConnected = Boolean(onSendMessage);

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

  return (
    <div className="flex h-full flex-col rounded-xl border border-[#E8E8F0] bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#E8E8F0] px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#6C63FF] text-white">
          <Bot size={16} />
        </div>
        <span className="text-sm font-semibold text-[#1A1A2E]">{title}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[#E8E8F0] bg-[#F8F9FF] p-4 text-xs leading-relaxed text-[#8B93B5]">
            {isConnected
              ? 'textnonerealtextmessage。english_textbackendenglish_text。'
              : 'english_textreal onSendMessage english_text，english_text，english_textlocalenglish_text。'}
          </div>
        ) : messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={idx}
              className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
            >
              {/* Avatar */}
              <div
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  isUser
                    ? 'bg-[#E8E8F0] text-[#6B7280]'
                    : 'bg-[#6C63FF] text-white'
                }`}
              >
                {isUser ? <User size={14} /> : <Bot size={14} />}
              </div>

              {/* Bubble */}
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-[#6C63FF] text-white'
                    : 'bg-[#F8F9FF] text-[#1A1A2E]'
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-[#E8E8F0] p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="inputmessage..."
          className="flex-1 rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] px-3 py-2 text-sm text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF] focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !onSendMessage}
          title={isConnected ? 'english_textrealtextAPI' : 'english_textrealtextAPI'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6C63FF] text-white transition-colors hover:bg-[#5A52D5] disabled:opacity-40 disabled:hover:bg-[#6C63FF]"
        >
          <SendHorizonal size={15} />
        </button>
      </div>
    </div>
  );
}

export default AssistantPanel;
