import type { Metadata, Viewport } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { AppShell } from '@/components/refx/app-shell'
import { AppProvider } from '@/components/refx/app-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Refx - Research Management',
  description: 'Advanced personal and team research manager for PDFs, references, comments, and knowledge synthesis',
  generator: 'v0.app',
  keywords: ['research', 'pdf', 'references', 'citations', 'comments', 'academic'],
  authors: [{ name: 'Refx Team' }],
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3ede2' },
    { media: '(prefers-color-scheme: dark)', color: '#1a1a1f' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          enableColorScheme={false}
          disableTransitionOnChange
        >
          <AppProvider>
            <AppShell>
              {children}
            </AppShell>
          </AppProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
