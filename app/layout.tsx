import { Manrope } from 'next/font/google';

// Funnel design system (build spec §7): Manrope with the documented fallback.
const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  fallback: ['Segoe UI', 'system-ui', 'sans-serif'],
});

export const metadata = {
  title: 'Avansai Cockpit',
  description: 'Candidate documentation cockpit',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={manrope.className}>
      <head>
        {/* Tabler outline icon webfont (spec §7: outline only, e.g. ti-mail). */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css"
        />
      </head>
      {/* bg token C.bg (#070709) — matrix/cyberpunk near-black */}
      <body style={{ margin: 0, background: '#070709' }}>{children}</body>
    </html>
  );
}
