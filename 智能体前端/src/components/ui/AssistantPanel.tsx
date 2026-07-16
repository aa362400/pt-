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
  title = 'AI 助手',
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
              ? '暂无真实助手消息。发送后将展示后端返回内容。'
              : '该助手面板未传入真实 onSendMessage 处理器，已禁用发送，未展示本地模拟欢迎词。'}
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
          placeholder="输入消息..."
          className="flex-1 rounded-lg border border-[#E8E8F0] bg-[#F8F9FF] px-3 py-2 text-sm text-[#1A1A2E] outline-none placeholder:text-[#9CA3AF] focus:border-[#6C63FF] focus:ring-1 focus:ring-[#6C63FF]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || !onSendMessage}
          title={isConnected ? '发送到真实助手接口' : '未接入真实助手接口'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6C63FF] text-white transition-colors hover:bg-[#5A52D5] disabled:opacity-40 disabled:hover:bg-[#6C63FF]"
        >
          <SendHorizonal size={15} />
        </button>
      </div>
    </div>
  );
}

export default AssistantPanel;
