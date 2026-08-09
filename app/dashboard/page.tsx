'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { LogOut, Sparkles, Utensils, Calendar, Dumbbell, Loader2, CheckCircle2 } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [workoutPlan, setWorkoutPlan] = useState<any>(null);
  const [dietPlan, setDietPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    // Fetch Profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    setProfile(profileData);

    // Fetch Active Plans if they exist
    const { data: wPlan } = await supabase
      .from('workout_plans')
      .select('plan_data')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();
      
    if (wPlan) setWorkoutPlan(wPlan.plan_data);

    const { data: dPlan } = await supabase
      .from('diet_plans')
      .select('plan_data')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();
      
    if (dPlan) setDietPlan(dPlan.plan_data);

    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const generateAIPlan = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile.id }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to generate');
      
      // Re-fetch data to show the new plans
      await fetchUserData();
    } catch (error: any) {
      alert("Error: " + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
        <p className="text-sm text-slate-400">Loading your space...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-md mx-auto pb-20">
      {/* Header */}
      <div className="flex justify-between items-center py-4 mb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            Welcome, {profile?.full_name?.split(' ')[0] || 'Athlete'}!
          </h1>
          <p className="text-xs text-slate-400 uppercase tracking-wider">
            {profile?.fitness_goal?.replace('_', ' ')} • {profile?.workout_location}
          </p>
        </div>
        <button onClick={handleLogout} className="p-2 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl">
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      {/* Profile Overview */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <Calendar className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-xs text-slate-400">Schedule</p>
          <p className="text-sm font-bold text-slate-200">{profile?.training_days} Days / Week</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <Utensils className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-xs text-slate-400">Diet</p>
          <p className="text-sm font-bold text-slate-200 capitalize">{profile?.dietary_preference}</p>
        </div>
      </div>

      {/* AI Generator Button (Shows only if plans don't exist) */}
      {!workoutPlan && (
        <div className="bg-gradient-to-br from-emerald-950 to-slate-900 border border-emerald-500/30 p-5 rounded-2xl mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-bold text-emerald-400">Adaptive AI Engine</h2>
          </div>
          <p className="text-xs text-slate-300 mb-4">
            Your profile is ready. Let Gemini AI build your personalized Week 1 plan based on your exact constraints.
          </p>
          <button
            onClick={generateAIPlan}
            disabled={isGenerating}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex justify-center items-center gap-2 disabled:opacity-50 transition-all"
          >
            {isGenerating ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Generating Plan... (Takes ~10s)</>
            ) : (
              "Generate My Plan"
            )}
          </button>
        </div>
      )}

      {/* Display Generated Plans */}
      {workoutPlan && dietPlan && (
        <div className="space-y-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold">Your AI Plan is Active</h2>
          </div>

          {/* Workout Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-3">
              <Dumbbell className="w-5 h-5 text-emerald-500" />
              <h3 className="font-bold">This Week's Workout</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4 italic">"{workoutPlan.summary}"</p>
            
            <div className="space-y-3">
              {workoutPlan.days.map((day: any, idx: number) => (
                <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-slate-800/50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-emerald-400">{day.day_name}</span>
                    <span className="text-xs text-slate-400">{day.is_rest_day ? 'Rest Day' : day.focus}</span>
                  </div>
                  {!day.is_rest_day && day.exercises?.map((ex: any, eIdx: number) => (
                    <div key={eIdx} className="text-xs mt-2 text-slate-300 flex justify-between">
                      <span>• {ex.name}</span>
                      <span className="text-slate-500">{ex.sets}x{ex.reps}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Diet Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3 border-b border-slate-800 pb-3">
              <Utensils className="w-5 h-5 text-emerald-500" />
              <h3 className="font-bold">Nutrition Plan</h3>
            </div>
            <div className="flex gap-4 mb-4 text-xs font-semibold text-slate-300">
              <span className="bg-slate-950 px-2 py-1 rounded-md border border-slate-800">{dietPlan.daily_calories_target} kcal</span>
              <span className="bg-slate-950 px-2 py-1 rounded-md border border-slate-800">P: {dietPlan.macronutrients.protein}</span>
            </div>
            
            <div className="space-y-3">
              {dietPlan.meal_plan.map((meal: any, idx: number) => (
                <div key={idx} className="bg-slate-950 p-3 rounded-xl border border-slate-800/50">
                  <span className="text-xs font-bold text-emerald-400 block mb-1">{meal.meal_name}</span>
                  <span className="text-xs text-slate-300">{meal.foods}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
