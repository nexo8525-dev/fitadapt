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
        // Get profile
        const { data: profileData, error: profileError } =
          await supabase
            .from('profiles')
            .select('*')
            .eq('clerk_user_id', user.id)
            .single();

        if (profileError) {
          console.error('Profile error:', profileError);
        }

        if (!profileData) {
          router.push('/onboarding');
          return;
        }

        setProfile(profileData);

        // Get workout plan
        const { data: workoutData, error: workoutError } =
          await supabase
            .from('workout_plans')
            .select('*')
            .eq('user_id', profileData.id)
            .eq('is_active', true)
            .maybeSingle();

        if (workoutError) {
          console.error('Workout error:', workoutError);
        }

        setWorkout(workoutData);

        // Get diet plan
        const { data: dietData, error: dietError } =
          await supabase
            .from('diet_plans')
            .select('*')
            .eq('user_id', profileData.id)
            .eq('is_active', true)
            .maybeSingle();

        if (dietError) {
          console.error('Diet error:', dietError);
        }

        setDiet(dietData);
      } catch (error) {
        console.error('Dashboard error:', error);
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
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (response.ok) {
        alert('Plan generated successfully!');
        window.location.reload();
      } else {
        alert(data.error || 'Failed to generate plan');
      }
    } catch (error) {
      console.error('Generate plan error:', error);
      alert('Network error. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-3xl mb-3">⚡</div>
          <p className="text-slate-300">Loading your dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Welcome, {profile?.full_name || user?.firstName || 'there'} 👋
            </h1>

            <p className="text-slate-400 mt-1">
              Your personalized FitAdapt plan
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="shrink-0 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl transition"
          >
            Logout
          </button>
        </div>

        {/* No Plan */}
        {!workout && !diet && (
          <section className="bg-slate-900 border border-slate-700 rounded-2xl p-6 text-center shadow-lg">
            <div className="text-5xl mb-4">🚀</div>

            <h2 className="text-2xl font-bold mb-2">
              Your plan is ready to be created
            </h2>

            <p className="text-slate-400 mb-6">
              Generate your personalized workout and diet plan based on your profile.
            </p>

            <button
              onClick={handleGeneratePlan}
              disabled={generating}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 text-white font-bold rounded-xl transition"
            >
              {generating ? 'Generating your plan...' : '🚀 Generate My Plan'}
            </button>
          </section>
        )}

        {/* Workout */}
        {workout && (
          <section className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 mb-6 shadow-lg">

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  🏋️ Workout - Week {workout.week_number}
                </h2>

                <p className="text-slate-400 text-sm mt-1">
                  Your personalized 7-day workout plan
                </p>
              </div>
            </div>

            {/* IMPORTANT: dark text so JSON is visible */}
            <div className="bg-slate-100 rounded-xl p-4 overflow-x-auto">
              <pre className="text-slate-900 text-sm leading-6 whitespace-pre-wrap break-words">
                {JSON.stringify(workout.plan_data, null, 2)}
              </pre>
            </div>

          </section>
        )}

        {/* Diet */}
        {diet && (
          <section className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 mb-6 shadow-lg">

            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  🥗 Diet - Week {diet.week_number}
                </h2>

                <p className="text-slate-400 text-sm mt-1">
                  Your personalized 7-day diet plan
                </p>
              </div>
            </div>

            {/* IMPORTANT: dark text so JSON is visible */}
            <div className="bg-slate-100 rounded-xl p-4 overflow-x-auto">
              <pre className="text-slate-900 text-sm leading-6 whitespace-pre-wrap break-words">
                {JSON.stringify(diet.plan_data, null, 2)}
              </pre>
            </div>

          </section>
        )}

        {/* Generate another plan */}
        {(workout || diet) && (
          <div className="text-center pb-8">
            <button
              onClick={handleGeneratePlan}
              disabled={generating}
              className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-600 text-white font-semibold rounded-xl transition"
            >
              {generating ? 'Generating...' : '🔄 Regenerate Plan'}
            </button>
          </div>
        )}

      </div>
    </main>
  );
  }
