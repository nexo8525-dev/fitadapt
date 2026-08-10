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
  const [generating, setGenerating] = useState(false);

  // Fetch profile and plans
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.push('/login');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Profile
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

        // Active Workout Plan
        const { data: workout } = await supabase
          .from('workout_plans')
          .select('plan_data, week_number')
          .eq('user_id', profileData.id)
          .eq('is_active', true)
          .maybeSingle();
        setWorkoutPlan(workout);

        // Active Diet Plan
        const { data: diet } = await supabase
          .from('diet_plans')
          .select('plan_data, week_number')
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

  const handleGeneratePlan = async () => {
    setGenerating(true);
    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (response.ok) {
        alert('Plan generated successfully! Refreshing...');
        window.location.reload(); // Simple refresh to load new plan
      } else {
        alert(data.error || 'Failed to generate plan');
      }
    } catch (error) {
      console.error(error);
      alert('Network error. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  if (loading) return <div className="p-8 text-center">Loading dashboard...</div>;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Welcome, {profile?.full_name} 👋</h1>
        <button onClick={handleLogout} className="px-4 py-2 bg-red-500 text-white rounded">
          Logout
        </button>
      </div>

      {/* Generate Plan Button */}
      {!workoutPlan && !dietPlan && (
        <div className="bg-yellow-50 border border-yellow-200 p-6 rounded-lg mb-6 text-center">
          <h2 className="text-xl font-semibold mb-2">No Active Plan Found</h2>
          <p className="text-gray-600 mb-4">Click the button below to generate your first personalized plan.</p>
          <button
            onClick={handleGeneratePlan}
            disabled={generating}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
          >
            {generating ? 'Generating... (may take 10-15s)' : '🚀 Generate My First Plan'}
          </button>
        </div>
      )}

      {/* Display Workout Plan */}
      {workoutPlan && (
        <div className="bg-white border rounded-lg p-4 mb-4 shadow-sm">
          <h2 className="text-xl font-bold mb-2">🏋️ Workout Plan - Week {workoutPlan.week_number}</h2>
          <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-96">
            {JSON.stringify(workoutPlan.plan_data, null, 2)}
          </pre>
        </div>
      )}

      {/* Display Diet Plan */}
      {dietPlan && (
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-xl font-bold mb-2">🥗 Diet Plan - Week {dietPlan.week_number}</h2>
          <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-96">
            {JSON.stringify(dietPlan.plan_data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
  }
