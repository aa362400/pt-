import { useState, useRef, useEffect, type ReactNode } from 'react';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

function Dropdown({ trigger, children, align = 'left' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen(!open)} className="cursor-pointer">{trigger}</div>
      {open && (
        <div
          className={`absolute z-50 mt-1 min-w-[160px] rounded-xl border border-[#E8E8F0] bg-white py-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ children, onClick, active }: { children: ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[#F8F9FF] ${
        active ? 'text-[#6C63FF] bg-[#F0EEFF]' : 'text-[#4A5578]'
      }`}
    >
      {children}
    </button>
  );
}

export { Dropdown, DropdownItem };
