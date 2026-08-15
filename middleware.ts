import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    '/dashboard(.*)',
    '/onboarding(.*)',
    '/api/(.*)',
  ],
};
