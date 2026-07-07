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
    defaultLabel: '成功',
  },
  running: {
    dot: '#34D399',
    bg: 'bg-[#34D399]/10',
    text: 'text-[#34D399]',
    defaultLabel: '运行中',
  },
  warning: {
    dot: '#FB923C',
    bg: 'bg-[#FB923C]/10',
    text: 'text-[#FB923C]',
    defaultLabel: '警告',
  },
  danger: {
    dot: '#EF4444',
    bg: 'bg-[#EF4444]/10',
    text: 'text-[#EF4444]',
    defaultLabel: '异常',
  },
  pending: {
    dot: '#9CA3AF',
    bg: 'bg-[#9CA3AF]/10',
    text: 'text-[#9CA3AF]',
    defaultLabel: '待处理',
  },
  paused: {
    dot: '#9CA3AF',
    bg: 'bg-[#9CA3AF]/10',
    text: 'text-[#9CA3AF]',
    defaultLabel: '已暂停',
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
