import { ClerkProvider } from '@clerk/nextjs';
import './globals.css';

export const metadata = {
  title: 'FitAdapt AI - Personalized Fitness Coach',
  description: 'AI-powered adaptive fitness and diet coach.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="bg-slate-950 text-slate-100 min-h-screen">
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
