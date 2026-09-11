import type { Metadata, Viewport } from 'next';
import './globals.css';
import QueryProvider from '@/components/shared/QueryProvider';
import PWAInstaller from '@/components/shared/PWAInstaller';
import PWAInstallPrompt from '@/components/shared/PWAInstallPrompt';

export const viewport: Viewport = {
  themeColor: '#0B3323',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: {
    default: 'eFootball Tournament Platform',
    template: '%s | eFootball Tournament Platform',
  },
  description: 'Official portal for eFootball tournaments, fixtures, brackets, standings, and live streaming.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'eFootball',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <QueryProvider>
          <PWAInstaller />
          {children}
          <PWAInstallPrompt />
        </QueryProvider>
      </body>
    </html>
  );
}
