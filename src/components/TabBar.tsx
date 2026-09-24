import type { ComponentType } from 'react';
import { IconJournal, IconLibrary, IconSettings, IconStreak, IconToday } from './Icons';

export type Tab = 'home' | 'streak' | 'library' | 'journal' | 'settings';

interface Props {
  current: string;
  onSelect: (tab: Tab) => void;
}

const TABS: { id: Tab; label: string; Icon: ComponentType<{ active?: boolean }> }[] = [
  { id: 'home', label: 'Today', Icon: IconToday },
  { id: 'streak', label: 'Practice', Icon: IconStreak },
  { id: 'library', label: 'Library', Icon: IconLibrary },
  { id: 'journal', label: 'Journal', Icon: IconJournal },
  { id: 'settings', label: 'Settings', Icon: IconSettings },
];

/**
 * Fixed bottom tab bar — the layout people already have muscle memory for on a
 * phone, and the reason the old top row of six text links had to go: it
 * clipped on a 375px screen and its tap targets were well under the 44px
 * everyone's thumb expects.
 */
export function TabBar({ current, onSelect }: Props) {
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ id, label, Icon }) => {
        const active = current === id;
        return (
          <button
            key={id}
            className="tab"
            aria-current={active ? 'page' : undefined}
            onClick={() => onSelect(id)}
          >
            <Icon active={active} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
