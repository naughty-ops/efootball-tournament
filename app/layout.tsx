import type { Metadata } from 'next';
import './globals.css';
import QueryProvider from '@/components/shared/QueryProvider';

export const metadata: Metadata = {
  title: {
    default: 'eFootball Tournament Platform',
    template: '%s | eFootball Tournament Platform',
  },
  description: 'Official portal for eFootball tournaments, fixtures, brackets, and standings.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
