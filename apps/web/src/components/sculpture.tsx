// Decorative, code-native brand artwork. No product inventory or account data.
export function Sculpture({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`relative mx-auto aspect-square w-full ${compact ? 'max-w-[340px]' : 'max-w-[520px]'}`}
    >
      <svg viewBox="0 0 520 520" className="size-full overflow-visible" fill="none">
        <defs>
          <linearGradient
            id="bag"
            x1="180"
            y1="130"
            x2="400"
            y2="430"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#8da0ff" />
            <stop offset=".45" stopColor="#4f6bf0" />
            <stop offset="1" stopColor="#263ca3" />
          </linearGradient>
          <linearGradient
            id="side"
            x1="345"
            y1="205"
            x2="430"
            y2="420"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#4059c7" />
            <stop offset="1" stopColor="#1a2b81" />
          </linearGradient>
          <linearGradient
            id="handle"
            x1="230"
            y1="110"
            x2="320"
            y2="220"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#c9d2ff" />
            <stop offset="1" stopColor="#7289ec" />
          </linearGradient>
          <radialGradient id="halo">
            <stop stopColor="#5470e7" stopOpacity=".25" />
            <stop offset="1" stopColor="#5470e7" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="265" cy="265" r="255" fill="url(#halo)" />
        <circle cx="260" cy="265" r="199" stroke="currentColor" strokeOpacity=".12" />
        <ellipse
          cx="260"
          cy="265"
          rx="245"
          ry="105"
          transform="rotate(-30 260 265)"
          stroke="currentColor"
          strokeOpacity=".18"
        />
        <ellipse cx="280" cy="439" rx="130" ry="17" fill="#070e28" fillOpacity=".18" />
        <g transform="rotate(-9 260 260)">
          <path d="m160 185 184-21 55 40-5 218-48 27-187-50Z" fill="url(#side)" />
          <path d="m160 185 186 27v237l-187-50Z" fill="url(#bag)" />
          <path d="m160 185 184-21 55 40-53 8Z" fill="#b4c1ff" />
          <path d="M207 218v-72c0-76 89-62 89 9v75" stroke="#273b97" strokeWidth="17" />
          <path
            d="M207 211v-72c0-76 89-62 89 9v75"
            stroke="url(#handle)"
            strokeWidth="12"
          />
          <path
            d="m233 298 25-13 25 20v40l-25 11-25-18v-40Z"
            stroke="#e1e7ff"
            strokeOpacity=".85"
            strokeWidth="2"
          />
          <path
            d="m233 298 25 20 25-13m-25 13v38"
            stroke="#e1e7ff"
            strokeOpacity=".85"
            strokeWidth="2"
          />
          <path d="m174 204-1 177 157 44" stroke="white" strokeOpacity=".14" />
        </g>
        <circle cx="87" cy="300" r="7" fill="#a4b7ff" />
        <circle cx="423" cy="168" r="5" fill="#a4b7ff" />
        <path d="M392 93v24m-12-12h24" stroke="#c6d1ff" strokeWidth="2" />
        <path d="m109 135 7 7-7 7-7-7 7-7Z" fill="#8f9ddd" />
      </svg>
    </div>
  );
}
