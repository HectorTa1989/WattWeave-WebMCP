/** Minimal SF-Symbols-flavored line icons. Stroke-based, currentColor. */

interface IconProps {
  size?: number
  className?: string
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const BoltIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M13 2 4.5 13.5H11l-1 8.5 9-11.5h-6.5z" fill="currentColor" stroke="none" />
  </svg>
)

export const LockIcon = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
)

export const UnlockIcon = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V7a4 4 0 0 1 7.5-2" />
  </svg>
)

export const ServerIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="3" y="4" width="18" height="7" rx="2" />
    <rect x="3" y="13" width="18" height="7" rx="2" />
    <path d="M7 7.5h.01M7 16.5h.01" />
  </svg>
)

export const AccessibilityIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <circle cx="12" cy="4.5" r="1.8" />
    <path d="M5 8.5h14M12 8.5v6M12 14.5 8.5 20M12 14.5 15.5 20" />
  </svg>
)

export const SnowIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11" />
    <path d="M9 4.5 12 7l3-2.5M9 19.5 12 17l3 2.5" />
  </svg>
)

export const CarIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M4 16v-3.2L6 8h9l2.2 4.8H20v3.2" />
    <circle cx="7.5" cy="17" r="1.8" />
    <circle cx="16.5" cy="17" r="1.8" />
    <path d="M9.5 16h5" />
  </svg>
)

export const DishIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M4 8h16" />
    <circle cx="12" cy="14.5" r="3.5" />
  </svg>
)

export const BatteryIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="2.5" y="7" width="17" height="10" rx="3" />
    <path d="M21.5 10.5v3" />
    <path d="M11.5 9 9 13h3l-.5 2.5L14.5 11h-3z" fill="currentColor" stroke="none" />
  </svg>
)

export const SunIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </svg>
)

export const BuildingIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21" />
    <path d="M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21M2.5 21h19" />
    <path d="M7 8h4M7 12h4M7 16h4M17 14h.01M17 17.5h.01" />
  </svg>
)

export const GridIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 3v18M6 6.5 12 9l6-2.5M6 12l6 2.5 6-2.5" />
    <path d="M6 5v14M18 5v14" />
  </svg>
)

export const CheckIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </svg>
)

export const XIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

export const WarnIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 3.5 21.5 20H2.5L12 3.5z" />
    <path d="M12 10v4.5M12 17.5h.01" />
  </svg>
)

export const UndoIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H8" />
    <path d="M7.5 5.5 4 9l3.5 3.5" />
  </svg>
)

export const PlayIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
  </svg>
)

export const StopIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor" stroke="none" />
  </svg>
)

export const EyeIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
)

export const ChevronIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M9 5.5 15.5 12 9 18.5" />
  </svg>
)

export const SparkIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z" />
    <path d="M18.5 3.5v3M20 5h-3" />
  </svg>
)

export const TerminalIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <rect x="2.5" y="4" width="19" height="16" rx="2.5" />
    <path d="M7 9.5 10 12l-3 2.5M12.5 15h4.5" />
  </svg>
)

export const MoonIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
  </svg>
)

export const DocIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M6 2.5h7.5L19 8v13.5H6z" />
    <path d="M13 2.5V8h6M9 12.5h6M9 16.5h6" />
  </svg>
)

export const ShieldIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className} aria-hidden="true">
    <path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" />
    <path d="M9 12l2 2 4-4" />
  </svg>
)
