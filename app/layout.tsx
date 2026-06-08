export const metadata = {
  title: 'Avansai Cockpit',
  description: 'Candidate documentation cockpit',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
