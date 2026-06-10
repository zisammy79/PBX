import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: 'PBX Platform',
  description: 'Multi-tenant AI-native virtual PBX',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
