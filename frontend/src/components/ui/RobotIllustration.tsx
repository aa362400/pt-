interface RobotIllustrationProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'welcome' | 'working';
  className?: string;
}

const sizeMap = {
  sm: { w: 80, h: 80 },
  md: { w: 120, h: 120 },
  lg: { w: 160, h: 160 },
};

function RobotIllustration({ size = 'md', variant = 'default', className = '' }: RobotIllustrationProps) {
  const { w, h } = sizeMap[size];

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: w, height: h }}>
      <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        {/* Robot body */}
        <rect x="35" y="45" width="50" height="45" rx="10" fill="#6C63FF" opacity="0.15" />
        <rect x="40" y="50" width="40" height="35" rx="8" fill="#6C63FF" opacity="0.25" />

        {/* Robot head */}
        <rect x="38" y="18" width="44" height="32" rx="10" fill="#6C63FF" opacity="0.2" />
        <rect x="42" y="22" width="36" height="24" rx="8" fill="#6C63FF" opacity="0.35" />

        {/* Eyes */}
        <circle cx="52" cy="34" r="4" fill="#6C63FF" />
        <circle cx="68" cy="34" r="4" fill="#6C63FF" />
        {variant === 'welcome' && (
          <>
            {/* Wink/eye shine */}
            <circle cx="53" cy="33" r="1.5" fill="white" opacity="0.8" />
            <circle cx="69" cy="33" r="1.5" fill="white" opacity="0.8" />
          </>
        )}

        {/* Mouth */}
        {variant === 'default' && (
          <rect x="52" y="40" width="16" height="2" rx="1" fill="#6C63FF" opacity="0.5" />
        )}
        {variant === 'welcome' && (
          <path d="M52 41 Q60 46 68 41" stroke="#6C63FF" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.6" />
        )}
        {variant === 'working' && (
          <rect x="52" y="40" width="16" height="3" rx="1.5" fill="#6C63FF" opacity="0.5" />
        )}

        {/* Antenna */}
        <line x1="60" y1="18" x2="60" y2="8" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
        <circle cx="60" cy="6" r="3" fill="#6C63FF" opacity="0.5" />

        {/* Arms */}
        {variant === 'working' ? (
          <>
            <rect x="28" y="52" width="8" height="20" rx="4" fill="#6C63FF" opacity="0.2" />
            <rect x="84" y="52" width="8" height="20" rx="4" fill="#6C63FF" opacity="0.2" />
          </>
        ) : variant === 'welcome' ? (
          <>
            {/* Waving arm */}
            <rect x="28" y="50" width="7" height="18" rx="3.5" fill="#6C63FF" opacity="0.2" transform="rotate(-20, 31, 50)" />
            <rect x="85" y="50" width="7" height="18" rx="3.5" fill="#6C63FF" opacity="0.2" />
          </>
        ) : (
          <>
            <rect x="28" y="55" width="7" height="16" rx="3.5" fill="#6C63FF" opacity="0.2" />
            <rect x="85" y="55" width="7" height="16" rx="3.5" fill="#6C63FF" opacity="0.2" />
          </>
        )}

        {/* Feet */}
        <rect x="42" y="88" width="14" height="6" rx="3" fill="#6C63FF" opacity="0.2" />
        <rect x="64" y="88" width="14" height="6" rx="3" fill="#6C63FF" opacity="0.2" />

        {/* Decorative dots */}
        <circle cx="45" cy="62" r="2" fill="#6C63FF" opacity="0.15" />
        <circle cx="60" cy="68" r="2" fill="#6C63FF" opacity="0.15" />
        <circle cx="75" cy="62" r="2" fill="#6C63FF" opacity="0.15" />

        {/* Glow effect */}
        {variant === 'welcome' && (
          <>
            <circle cx="60" cy="55" r="35" fill="#6C63FF" opacity="0.05" />
            <circle cx="60" cy="55" r="45" fill="#6C63FF" opacity="0.03" />
          </>
        )}
      </svg>
    </div>
  );
}

export default RobotIllustration;
