'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { supabase } from '@/lib/supabase';

export default function HomePage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      router.push('/login');
      return;
    }

    const checkProfile = async () => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id')
        .eq('clerk_user_id', user.id)
        .maybeSingle();

      if (profile) {
        router.push('/dashboard');
      } else {
        router.push('/onboarding');
      }
    };

    checkProfile();
  }, [isLoaded, isSignedIn, user, router]);

  return <div>Loading...</div>;
}
