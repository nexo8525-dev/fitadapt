// app/dashboard/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useUser } from '@clerk/nextjs';
import { supabase } from '@/lib/supabase'; // adjust path if needed

// ============================================================
// Types
// ============================================================
interface Profile {
  id: string;
  clerk_user_id: string;
  initial_weight_kg: number;
}

interface WorkoutPlan {
  id: string;
  user_id: string;
  week_number: number;
  plan_data: any;
  is_active: boolean;
}

interface DietPlan {
  id: string;
  user_id: string;
  week_number: number;
  plan_data: any;
  is_active: boolean;
}

interface WeeklyCheckin {
  id: string;
  user_id: string;
  week_number: number;
  weight_kg: number;
  workout_difficulty: string;
  energy_rating: number;
  workouts_completed_count: number;
  diet_completed_count: number;
  user_notes: string | null;
  ai_analysis: string | null;
  created_at: string;
}

// ============================================================
// Main Component
// ============================================================
export default function DashboardPage() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutPlan | null>(null);
  const [activeDiet, setActiveDiet] = useState<DietPlan | null>(null);
  const [latestCheckin, setLatestCheckin] = useState<WeeklyCheckin | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    weight_kg: '',
    workout_difficulty: 'Just Right' as 'Too Easy' | 'Just Right' | 'Too Hard',
    energy_rating: 3,
    user_notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Get profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('id, clerk_user_id, initial_weight_kg')
        .eq('clerk_user_id', user.id)
        .single();
      if (profileErr) throw profileErr;
      setProfile(profileData);

      // 2. Get active workout plan
      const { data: workout, error: wpErr } = await supabase
        .from('workout_plans')
        .select('*')
        .eq('user_id', profileData.id)
        .eq('is_active', true)
        .single();
      if (wpErr && wpErr.code !== 'PGRST116') throw wpErr;
      setActiveWorkout(workout || null);

      // 3. Get active diet plan
      const { data: diet, error: dpErr } = await supabase
        .from('diet_plans')
        .select('*')
        .eq('user_id', profileData.id)
        .eq('is_active', true)
        .single();
      if (dpErr && dpErr.code !== 'PGRST116') throw dpErr;
      setActiveDiet(diet || null);

      // 4. Get latest weekly check-in
      const { data: checkin, error: ciErr } = await supabase
        .from('weekly_checkins')
        .select('*')
        .eq('user_id', profileData.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ciErr && ciErr.code !== 'PGRST116') throw ciErr;
      setLatestCheckin(checkin || null);

      // Pre-fill weight if checkin exists
      if (checkin) {
        setFormData((prev) => ({
          ...prev,
          weight_kg: String(checkin.weight_kg),
        }));
      } else if (profileData.initial_weight_kg) {
        setFormData((prev) => ({
          ...prev,
          weight_kg: String(profileData.initial_weight_kg),
        }));
      }
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (isUserLoaded && user) {
      fetchData();
    }
  }, [isUserLoaded, user, fetchData]);

  // Handle form changes
  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleEnergyChange = (value: number) => {
    setFormData((prev) => ({ ...prev, energy_rating: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');

    try {
      const payload = {
        weight_kg: parseFloat(formData.weight_kg),
        workout_difficulty: formData.workout_difficulty,
        energy_rating: formData.energy_rating,
        user_notes: formData.user_notes,
      };

      const res = await fetch('/api/weekly-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');

      // Success: close modal and refresh data
      setModalOpen(false);
      await fetchData();
    } catch (err: any) {
      setSubmitError(err.message || 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isUserLoaded || loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Please sign in</div>
      </div>
    );
  }

  const currentWeek = activeWorkout?.week_number ?? 0;
  const showInsight = latestCheckin?.ai_analysis && currentWeek > 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-8">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-slate-400">Welcome back, {user.fullName || 'User'}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-indigo-900/50 px-3 py-1 text-sm font-medium text-indigo-300 ring-1 ring-indigo-500/30">
            Active: Week {currentWeek || '—'}
          </span>
        </div>
      </header>

      {/* AI Insight Card */}
      {showInsight && (
        <div className="mb-8 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-5 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🧠</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Coach AI Week {latestCheckin.week_number} Review
                </span>
              </div>
              <p className="mt-1 text-slate-200 leading-relaxed">
                {latestCheckin.ai_analysis}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dashboard content (existing cards for workout & diet plans would go here) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-xl font-semibold text-indigo-300">Workout Plan</h2>
          <div className="mt-4 text-slate-400">
            {activeWorkout ? (
              <p>Week {activeWorkout.week_number} active</p>
            ) : (
              <p>No active workout plan</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
          <h2 className="text-xl font-semibold text-emerald-300">Diet Plan</h2>
          <div className="mt-4 text-slate-400">
            {activeDiet ? (
              <p>Week {activeDiet.week_number} active</p>
            ) : (
              <p>No active diet plan</p>
            )}
          </div>
        </div>
      </div>

      {/* Action button */}
      <div className="flex justify-end">
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        >
          🏁 Complete Week {currentWeek} & Review
        </button>
      </div>

      {/* Custom Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl mx-4">
            <h2 className="text-2xl font-bold text-white mb-1">Weekly Check-In</h2>
            <p className="text-sm text-slate-400 mb-4">
              How did this week go? Let's review your progress.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Weight */}
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Current Weight (kg)
                </label>
                <input
                  type="number"
                  name="weight_kg"
                  value={formData.weight_kg}
                  onChange={handleFormChange}
                  step="0.1"
                  min="0"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="e.g. 72.5"
                />
              </div>

              {/* Workout Difficulty */}
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Workout Difficulty
                </label>
                <select
                  name="workout_difficulty"
                  value={formData.workout_difficulty}
                  onChange={handleFormChange}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Too Easy">Too Easy</option>
                  <option value="Just Right">Just Right</option>
                  <option value="Too Hard">Too Hard</option>
                </select>
              </div>

              {/* Energy Rating */}
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Energy Level (1–5)
                </label>
                <div className="mt-1 flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleEnergyChange(num)}
                      className={`h-10 w-10 rounded-full text-sm font-semibold transition ${
                        formData.energy_rating === num
                          ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-300">
                  Feedback / Notes
                </label>
                <textarea
                  name="user_notes"
                  value={formData.user_notes}
                  onChange={handleFormChange}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="How did this week feel? Any injuries or cravings?"
                />
              </div>

              {submitError && (
                <div className="text-sm text-red-400 bg-red-950/30 p-3 rounded-lg border border-red-800/50">
                  {submitError}
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-700 px-5 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="animate-spin">⚡</span>
                      AI Coach is analyzing...
                    </>
                  ) : (
                    'Submit Review'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
