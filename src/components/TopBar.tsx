'use client';

import { useKeyboardLayout } from '@/hooks/useKeyboardLayout';
import { computeStreak, useProgress } from '@/lib/progress';

export type TabId = 'learn' | 'songs' | 'free' | 'settings';

const TABS: { id: TabId; label: string }[] = [
  { id: 'learn', label: 'Learn' },
  { id: 'songs', label: 'Songs' },
  { id: 'free', label: 'Free play' },
  { id: 'settings', label: 'Settings' },
];

export default function TopBar({ tab, onTab }: { tab: TabId; onTab: (tab: TabId) => void }) {
  const layout = useKeyboardLayout();
  const days = useProgress((s) => s.days);
  const streak = computeStreak(days);

  return (
    <header className="sticky top-0 z-30 border-b border-line/60 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center gap-[3px] rounded-lg border border-line bg-panel2"
          >
            <span className="h-5 w-[3px] rounded-full bg-ink/80" />
            <span className="h-5 w-[3px] rounded-full bg-amber" />
            <span className="h-5 w-[3px] rounded-full bg-ink/40" />
          </span>
          <span>
            <span className="block font-display text-lg leading-none text-ink">KeyCoach</span>
            <span className="block text-[11px] leading-tight text-muted">
              piano on a computer keyboard
            </span>
          </span>
        </div>

        <span className="chip" title="Keys are labelled with the legends printed on your keyboard">
          <span className="h-1.5 w-1.5 rounded-full bg-amber" />
          layout {layout.effectiveLayout.toUpperCase()}
        </span>

        {streak > 0 ? (
          <span className="chip-amber">
            {streak} day streak
          </span>
        ) : null}

        <nav className="ml-auto flex items-center gap-1 rounded-xl border border-line/70 bg-panel/60 p-1">
          {TABS.map((item) => (
            <TabButton key={item.id} active={tab === item.id} onClick={() => onTab(item.id)}>
              {item.label}
            </TabButton>
          ))}
        </nav>
      </div>
    </header>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={[
        'rounded-lg px-3.5 py-1.5 text-sm font-semibold transition duration-150 motion-reduce:transition-none',
        active
          ? 'bg-amber text-[#201704] shadow-[0_3px_0_0_rgba(169,122,44,0.9)]'
          : 'text-muted hover:bg-panel2 hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  );
}