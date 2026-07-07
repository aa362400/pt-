interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

function ChartCard({ title, subtitle, children, className = '', action }: ChartCardProps) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-[#E8E8F0] bg-white shadow-sm ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#E8E8F0] px-5 py-4">
        <div className="flex flex-col">
          <h3 className="text-base font-semibold text-[#1A1A2E]">{title}</h3>
          {subtitle && (
            <span className="text-xs text-[#9CA3AF]">{subtitle}</span>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {/* Content */}
      <div className="p-5">{children}</div>
    </div>
  );
}

export default ChartCard;
