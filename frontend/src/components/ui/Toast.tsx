import { useState, useCallback, type ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { ToastContext } from './toast-context.js';
import type { Toast, ToastType } from './toast-types.js';

let nextId = 0;

function getToastClasses(type: ToastType): string {
  switch (type) {
    case 'success':
      return 'bg-white border-[#34D399]';
    case 'error':
      return 'bg-white border-[#FF5A6A]';
    case 'warning':
      return 'bg-white border-[#FFB020]';
    case 'info':
    default:
      return 'bg-white border-[#4A9EFF]';
  }
}

function ToastIcon({ type }: { type: ToastType }) {
  switch (type) {
    case 'success':
      return <CheckCircle size={18} className="text-[#34D399] shrink-0 mt-0.5" />;
    case 'error':
      return <AlertCircle size={18} className="text-[#FF5A6A] shrink-0 mt-0.5" />;
    case 'warning':
      return <AlertTriangle size={18} className="text-[#FFB020] shrink-0 mt-0.5" />;
    case 'info':
    default:
      return <Info size={18} className="text-[#4A9EFF] shrink-0 mt-0.5" />;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => removeToast(id), 3000);
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 min-w-[280px] max-w-[400px]">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm animate-slide-in ${getToastClasses(toast.type)}`}
          >
            <ToastIcon type={toast.type} />
            <span className="text-sm text-[#1A1A2E] flex-1">{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#8B93B5] hover:text-[#1A1A2E] shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}