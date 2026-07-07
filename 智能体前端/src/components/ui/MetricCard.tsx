import { TrendingUp, TrendingDown } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: React.ReactNode;
}

function MetricCard({ title, value, change, changeLabel, icon }: MetricCardProps) {
  const isUp = change !== undefined && change >= 0;
  const changeColor =
    change === undefined
      ? 'text-[#6B7280]'
      : isUp
        ? 'text-[#34D399]'
        : 'text-[#EF4444]';

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-[#E8E8F0] bg-white p-5 shadow-sm">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#6B7280]">{title}</span>
        {icon && <span className="text-[#6C63FF]">{icon}</span>}
      </div>

      {/* Value */}
      <span className="text-3xl font-bold text-[#1A1A2E]">{value}</span>

      {/* Change indicator */}
      {change !== undefined && (
        <div className="mt-1 flex items-center gap-1 text-xs">
          {change !== 0 &&
            (isUp ? (
              <TrendingUp size={14} className={changeColor} />
            ) : (
              <TrendingDown size={14} className={changeColor} />
            ))}
          <span className={`font-medium ${changeColor}`}>
            {isUp ? '+' : ''}{change}
            {changeLabel ? ` ${changeLabel}` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

export default MetricCard;
