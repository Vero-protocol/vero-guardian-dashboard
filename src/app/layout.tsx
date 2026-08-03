import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import type { ReactElement, ReactNode } from 'react';
import { WalletProvider } from '@/context/WalletContext';
import { RoleProvider } from '@/context/RoleContext';
import { AlertProvider } from '@/context/AlertContext';
import { ToastProvider } from '@/components/Toast';
import { ThemeProvider, themeScript } from '@/context/ThemeContext';
import { I18nProvider } from '@/i18n';
import { NetworkProvider } from '@/context/NetworkContext';
import { SocketIOProvider } from '@/context/SocketIOContext';
import DevWalletSwitcher from '@/components/DevWalletSwitcher';
import { ErrorProvider } from '@/components/ErrorModal';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Vero Guardian Dashboard',
  description: 'Decentralized Validation Network Dashboard',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): ReactElement {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        {/*
          Anti-flicker script: runs synchronously before first paint to apply
          the correct dark/light class from localStorage, preventing theme flash.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 transition-colors duration-200">
        <I18nProvider>
          <AlertProvider>
            <ThemeProvider>
              <NetworkProvider>
                  <WalletProvider>
                    <RoleProvider>
                      <SocketIOProvider>
                        <ErrorProvider>
                          <ToastProvider>
                            {children}
                          </ToastProvider>
                        </ErrorProvider>
                      </SocketIOProvider>
                    </RoleProvider>
                    {/* DEV-ONLY: renders null in production */}
                    <DevWalletSwitcher />
                  </WalletProvider>
              </NetworkProvider>
            </ThemeProvider>
          </AlertProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
