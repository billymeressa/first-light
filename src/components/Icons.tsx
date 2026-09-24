/**
 * Inline stroke icons for the tab bar. Hand-rolled rather than an icon
 * package: five icons doesn't justify a dependency, and inlining keeps them
 * on the same currentColor/stroke transitions as everything else — plus the
 * app makes no network requests, so a CDN icon font was never an option.
 */

interface IconProps {
  /** Filled variants read as "selected" on a tab bar the way native apps do. */
  active?: boolean;
}

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** Sunrise — the app's own metaphor, and the Today tab. */
export function IconToday({ active }: IconProps) {
  return (
    <svg {...base}>
      <circle cx="12" cy="13" r="3.4" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.28 : 1} />
      <circle cx="12" cy="13" r="3.4" />
      <path d="M12 5.5v1.6M18.4 13h1.6M4 13h1.6M16.6 8.4l1.1-1.1M6.3 7.3l1.1 1.1" />
      <path d="M3 19h18" opacity="0.55" />
    </svg>
  );
}

/** Flame — the streak. */
export function IconStreak({ active }: IconProps) {
  return (
    <svg {...base}>
      <path
        d="M12 3.5c2.2 2.6 3.2 4.6 3.2 6.2 0 1.1-.5 2-1.4 2.6.5-1.6.1-3-1.3-4.3.2 2.5-1 3.6-2.3 4.9-1 1-1.9 2.1-1.9 3.7A5.7 5.7 0 0 0 14 21a5.6 5.6 0 0 0 4.2-5.5c0-4.2-3.3-7.3-6.2-12z"
        fill={active ? 'currentColor' : 'none'}
        opacity={active ? 0.28 : 1}
      />
      <path d="M12 3.5c2.2 2.6 3.2 4.6 3.2 6.2 0 1.1-.5 2-1.4 2.6.5-1.6.1-3-1.3-4.3.2 2.5-1 3.6-2.3 4.9-1 1-1.9 2.1-1.9 3.7A5.7 5.7 0 0 0 14 21a5.6 5.6 0 0 0 4.2-5.5c0-4.2-3.3-7.3-6.2-12z" />
    </svg>
  );
}

/** Stacked cards — the affirmation library. */
export function IconLibrary({ active }: IconProps) {
  return (
    <svg {...base}>
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.4" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.28 : 1} />
      <rect x="3.5" y="7.5" width="17" height="12" rx="2.4" />
      <path d="M6.5 4.5h11M8 12h8M8 15h5" opacity="0.8" />
    </svg>
  );
}

/** Open page with a pen stroke — the journal. */
export function IconJournal({ active }: IconProps) {
  return (
    <svg {...base}>
      <path
        d="M5 4.5h9a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z"
        fill={active ? 'currentColor' : 'none'}
        opacity={active ? 0.28 : 1}
      />
      <path d="M5 4.5h9a2 2 0 0 1 2 2V20H7a2 2 0 0 1-2-2z" />
      <path d="M8.5 9h5M8.5 12.5h5M8.5 16h3" opacity="0.8" />
      <path d="M18.5 5.5 20 7l-4 4-1.6.4.4-1.6z" />
    </svg>
  );
}

/** Sliders — settings. */
export function IconSettings({ active }: IconProps) {
  return (
    <svg {...base}>
      <path d="M5 8h9M17.5 8H19M5 16h3M11.5 16H19" />
      <circle cx="15.5" cy="8" r="2.2" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.28 : 1} />
      <circle cx="15.5" cy="8" r="2.2" />
      <circle cx="9.5" cy="16" r="2.2" fill={active ? 'currentColor' : 'none'} opacity={active ? 0.28 : 1} />
      <circle cx="9.5" cy="16" r="2.2" />
    </svg>
  );
}

/** Person — the account row inside Settings. */
export function IconAccount() {
  return (
    <svg {...base} width={20} height={20}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

export function IconChevron() {
  return (
    <svg {...base} width={18} height={18}>
      <path d="M9.5 6.5 15 12l-5.5 5.5" />
    </svg>
  );
}
