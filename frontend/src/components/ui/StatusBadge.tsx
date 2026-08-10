import type { StatusType } from '../../types';

interface StatusBadgeProps {
  status: StatusType;
  label?: string;
}

const statusConfig: Record<StatusType, { dot: string; bg: string; text: string; defaultLabel: string }> = {
  success: {
    dot: '#34D399',
    bg: 'bg-[#34D399]/10',
    text: 'text-[#34D399]',
    defaultLabel: 'success',
  },
  running: {
    dot: '#34D399',
    bg: 'bg-[#34D399]/10',
    text: 'text-[#34D399]',
    defaultLabel: 'running',
  },
  warning: {
    dot: '#FB923C',
    bg: 'bg-[#FB923C]/10',
    text: 'text-[#FB923C]',
    defaultLabel: 'text',
  },
  danger: {
    dot: '#EF4444',
    bg: 'bg-[#EF4444]/10',
    text: 'text-[#EF4444]',
    defaultLabel: 'text',
  },
  pending: {
    dot: '#9CA3AF',
    bg: 'bg-[#9CA3AF]/10',
    text: 'text-[#9CA3AF]',
    defaultLabel: 'pending',
  },
  paused: {
    dot: '#9CA3AF',
    bg: 'bg-[#9CA3AF]/10',
    text: 'text-[#9CA3AF]',
    defaultLabel: 'english_text',
  },
};

function StatusBadge({ status, label }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: config.dot }}
      />
      {label ?? config.defaultLabel}
    </span>
  );
}

export default StatusBadge;
