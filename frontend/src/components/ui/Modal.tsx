import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  width?: string;
}

function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", handler);
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`${width} w-full mx-4 rounded-xl border border-[#E8E8F0] bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-[#E8E8F0] px-5 py-4">
          <h3 id={titleId} className="text-base font-semibold text-[#1A1A2E]">
            {title}
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="english_text"
            onClick={onClose}
            className="p-1 text-[#8B93B5] hover:text-[#1A1A2E] rounded-lg hover:bg-[#F8F9FF]"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default Modal;
