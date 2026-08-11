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
  const [workout, setWorkout] = useState<any>(null);
  const [diet, setDiet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Profile fetch
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

        // Active workout plan
        const { data: workoutData } = await supabase
          .from('workout_plans')
          .select('*')
          .eq('user_id', profileData.id)
          .eq('is_active', true)
          .maybeSingle();
        setWorkout(workoutData);

        // Active diet plan
        const { data: dietData } = await supabase
          .from('diet_plans')
          .select('*')
          .eq('user_id', profileData.id)
          .eq('is_active', true)
          .maybeSingle();
        setDiet(dietData);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isLoaded, isSignedIn, user, router]);

  const handleGeneratePlan = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (response.ok) {
        alert('Plan generated! Refreshing...');
        window.location.reload();
      } else {
        alert(data.error || 'Failed to generate plan');
      }
    } catch (error) {
      console.error(error);
      alert('Network error');
    } finally {
      setGenerating(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading) return <div className="p-8 text-center">Loading...</div>;

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Welcome, {profile?.full_name} 👋</h1>
        <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded">
          Logout
        </button>
      </div>

      {!workout && !diet && (
        <div className="bg-yellow-50 border p-6 rounded-lg text-center">
          <h2 className="text-xl font-semibold">No Active Plan</h2>
          <p className="text-gray-600 mb-4">Generate your first personalized plan.</p>
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
          >
            {generating ? 'Generating...' : '🚀 Generate My First Plan'}
          </button>
        </div>
      )}

      {workout && (
        <div className="border rounded-lg p-4 mb-4">
          <h2 className="text-xl font-bold">🏋️ Workout - Week {workout.week_number}</h2>
          <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-96">
            {JSON.stringify(workout.plan_data, null, 2)}
          </pre>
        </div>
      )}

      {diet && (
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-bold">🥗 Diet - Week {diet.week_number}</h2>
          <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-96">
            {JSON.stringify(diet.plan_data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
          }
