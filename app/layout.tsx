import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Study Buddy',
  description: 'Voice-powered AI learning assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
