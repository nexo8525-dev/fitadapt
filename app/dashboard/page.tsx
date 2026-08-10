'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useClerk } from '@clerk/nextjs';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const router = useRouter();
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [profile, setProfile] = useState<any>(null);
  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  const [dietPlan, setDietPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('clerk_user_id', user.id)
          .single();

        if (!profileData) {
          router.push('/onboarding');
          return;
        }
        setProfile(profileData);

        const { data: workout } = await supabase
          .from('workout_plans')
          .select('plan_data')
          .eq('user_id', profileData.id)
          .eq('is_active', true)
          .maybeSingle();
        setWorkoutPlan(workout);

        const { data: diet } = await supabase
          .from('diet_plans')
          .select('plan_data')
          .eq('user_id', profileData.id)
          .eq('is_active', true)
          .maybeSingle();
        setDietPlan(diet);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isLoaded, isSignedIn, user, router]);

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading) return <div>Loading dashboard...</div>;

  return (
    <div>
      <h1>Welcome, {profile?.full_name}</h1>
      <button onClick={handleLogout}>Logout</button>
      {/* Yahan workout/diet plans display karo */}
    </div>
  );
}
