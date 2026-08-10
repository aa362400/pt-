import { ChevronUp, ChevronDown } from 'lucide-react';

interface StatsCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  trend?: { value: number; isUp: boolean };
  color?: string;
}

function StatsCard({ icon, value, label, trend, color = '#6C63FF' }: StatsCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
      {/* Icon circle */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}18`, color }}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="flex flex-col">
        <span className="text-2xl font-bold text-[#1A1A2E]">{value}</span>
        <span className="text-sm text-[#6B7280]">{label}</span>
      </div>

      {/* Trend indicator */}
      {trend && (
        <div
          className={`ml-auto flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium ${
            trend.isUp
              ? 'bg-[#34D399]/10 text-[#34D399]'
              : 'bg-[#EF4444]/10 text-[#EF4444]'
          }`}
        >
          {trend.isUp ? (
            <ChevronUp size={14} strokeWidth={2.5} />
          ) : (
            <ChevronDown size={14} strokeWidth={2.5} />
          )}
          <span>{Math.abs(trend.value)}%</span>
        </div>
      )}
    </div>
  );
}

export default StatsCard;
