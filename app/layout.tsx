import type { Metadata, Viewport } from 'next';
import './globals.css';
import QueryProvider from '@/components/shared/QueryProvider';
import PWAInstaller from '@/components/shared/PWAInstaller';
import PWAInstallPrompt from '@/components/shared/PWAInstallPrompt';
import PWASplashTransition from '@/components/shared/PWASplashTransition';

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
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'eFootball',
    startupImage: [
      { url: '/splash/splash-4k.png', media: '(device-width: 1024px) and (device-height: 1366px)' },
      { url: '/splash/splash-portrait.png', media: '(device-width: 768px) and (device-height: 1024px)' },
      { url: '/splash/splash-mobile.png', media: '(device-width: 390px) and (device-height: 844px)' },
    ],
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
          <PWASplashTransition />
          <PWAInstaller />
          {children}
          <PWAInstallPrompt />
        </QueryProvider>
      </body>
    </html>
  );
}
