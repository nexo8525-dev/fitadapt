import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Public routes - jahan authentication nahi chahiye
const isPublicRoute = createRouteMatcher([
  '/',
  '/login',
  '/sign-up',
]);

export default clerkMiddleware(async (auth, request) => {
  // Agar route public nahi hai toh protect karo
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Next.js internal files aur static files ko ignore karo
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // API routes aur trpc routes ke liye hamesha run karo
    '/(api|trpc)(.*)',
  ],
};
