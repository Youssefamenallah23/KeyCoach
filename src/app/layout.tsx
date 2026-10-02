import type { Metadata, Viewport } from 'next';
import './globals.css';
import StoreHydrator from '@/components/StoreHydrator';

export const metadata: Metadata = {
  title: 'KeyCoach',
  description:
    'A piano teacher you can practise with using nothing but a computer keyboard. Keyboard mapping, lessons, real-time feedback, timing scores and adaptive drills.',
};

export const viewport: Viewport = {
  themeColor: '#0b0a0d',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-ink antialiased">
        <div className="app-shell">
          <div className="grid-texture pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="relative">{children}</div>
        </div>
        <StoreHydrator />
      </body>
    </html>
  );
}