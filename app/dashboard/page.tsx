'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser, useClerk, useAuth } from '@clerk/nextjs';
import { createSupabaseClient } from '@/lib/supabase';

type Exercise = {
  name?: string;
  sets?: number | string;
  reps?: number | string;
  rest_seconds?: number | string;
  notes?: string;
};

type WorkoutDay = {
  focus?: string;
  duration_minutes?: number | string;
  exercises?: Exercise[];
};

type Meal = {
  meal?: string;
  items?: string[];
  approx_calories?: number | string;
  approx_protein_g?: number | string;
};

type DietDay = {
  breakfast?: Meal;
  lunch?: Meal;
  dinner?: Meal;
  snacks?: Meal[];
  daily_total_calories?: number | string;
  daily_total_protein_g?: number | string;
};

type PlanRow = {
  id: string;
  user_id: string;
  plan_data: any;
  week_number: number;
  is_active?: boolean;
};

type Profile = {
  id: string;
  clerk_user_id: string;
  full_name?: string;
  [key: string]: any;
};

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

function normalizePlanData(data: any) {
  if (!data) return {};

  if (typeof data === 'object') {
    return data;
  }

  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  return {};
}

function MealCard({
  title,
  meal,
}: {
  title: string;
  meal?: Meal;
}) {
  if (!meal) return null;

  return (
    <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4">
      <h4 className="text-lg font-bold text-white mb-2">
        {title}
      </h4>

      {meal.meal && (
        <p className="text-indigo-300 font-semibold mb-3">
          {meal.meal}
        </p>
      )}

      {Array.isArray(meal.items) && meal.items.length > 0 && (
        <ul className="space-y-1.5 mb-4">
          {meal.items.map((item, index) => (
            <li
              key={index}
              className="text-slate-300 text-sm flex gap-2"
            >
              <span>•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {meal.approx_calories !== undefined && (
          <span className="text-xs bg-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5">
            🔥 {meal.approx_calories} kcal
          </span>
        )}

        {meal.approx_protein_g !== undefined && (
          <span className="text-xs bg-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5">
            💪 {meal.approx_protein_g}g protein
          </span>
        )}
      </div>
    </div>
  );
}

function WorkoutDayCard({
  day,
  data,
  completed,
  loading,
  onToggleComplete,
}: {
  day: string;
  data: WorkoutDay;
  completed: boolean;
  loading: boolean;
  onToggleComplete: () => void;
}) {
  const exercises = Array.isArray(data?.exercises)
    ? data.exercises
    : [];

  return (
    <div className="rounded-2xl bg-slate-800 border border-slate-700 p-4">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-xl font-bold text-white">
            {day}
          </h3>

          {data?.focus && (
            <p className="text-indigo-300 font-semibold mt-1">
              {data.focus}
            </p>
          )}
        </div>

        {data?.duration_minutes !== undefined && (
          <span className="shrink-0 text-xs bg-slate-700 text-slate-200 rounded-lg px-2.5 py-1.5">
            ⏱️ {data.duration_minutes} min
          </span>
        )}
      </div>

      {exercises.length === 0 ? (
        <div className="rounded-xl bg-slate-900 p-4 text-slate-400 text-sm mb-4">
          Recovery / Rest day
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          {exercises.map((exercise, index) => (
            <div
              key={index}
              className="rounded-xl bg-slate-900 border border-slate-700 p-3"
            >
              <h4 className="font-bold text-white">
                {index + 1}. {exercise?.name || 'Exercise'}
              </h4>

              <div className="flex flex-wrap gap-2 mt-2">
                {exercise?.sets !== undefined && (
                  <span className="text-xs bg-slate-700 text-slate-300 rounded-lg px-2 py-1">
                    Sets: {exercise.sets}
                  </span>
                )}

                {exercise?.reps !== undefined && (
                  <span className="text-xs bg-slate-700 text-slate-300 rounded-lg px-2 py-1">
                    Reps: {exercise.reps}
                  </span>
                )}

                {exercise?.rest_seconds !== undefined && (
                  <span className="text-xs bg-slate-700 text-slate-300 rounded-lg px-2 py-1">
                    Rest: {exercise.rest_seconds}s
                  </span>
                )}
              </div>

              {exercise?.notes && (
                <p className="text-sm text-slate-400 mt-2">
                  {exercise.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onToggleComplete}
        disabled={loading}
        className={`w-full rounded-xl px-4 py-3 font-semibold transition ${
          completed
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-indigo-600 hover:bg-indigo-700'
        } text-white disabled:bg-slate-700 disabled:cursor-not-allowed`}
      >
        {loading
          ? 'Saving...'
          : completed
          ? '✓ Workout Completed'
          : 'Mark Workout Complete'}
      </button>
    </div>
  );
}

function WorkoutSection({
  workout,
  activity,
  activityLoading,
  onToggleComplete,
}: {
  workout: PlanRow;
  activity: Record<string, boolean>;
  activityLoading: Record<string, boolean>;
  onToggleComplete: (day: string) => void;
}) {
  const data = normalizePlanData(workout.plan_data);

  return (
    <section className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 mb-6">
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">
          🏋️ Workout - Week {workout.week_number}
        </h2>

        <p className="text-slate-400 mt-1">
          Your personalized 7-day workout plan
        </p>
      </div>

      <div className="space-y-4">
        {DAYS.map((day) => (
          <WorkoutDayCard
            key={day}
            day={day}
            data={data?.[day] || {}}
            completed={Boolean(activity[day])}
            loading={Boolean(activityLoading[day])}
            onToggleComplete={() => onToggleComplete(day)}
          />
        ))}
      </div>
    </section>
  );
}

function DietDayCard({
  day,
  data,
  completed,
  loading,
  onToggleComplete,
}: {
  day: string;
  data: DietDay;
  completed: boolean;
  loading: boolean;
  onToggleComplete: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 p-4">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-xl font-bold text-white">
          {day}
        </h3>

        <div className="flex flex-wrap gap-2 justify-end">
          {data.daily_total_calories !== undefined && (
            <span className="text-xs bg-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5">
              🔥 {data.daily_total_calories} kcal
            </span>
          )}

          {data.daily_total_protein_g !== undefined && (
            <span className="text-xs bg-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5">
              💪 {data.daily_total_protein_g}g protein
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MealCard
          title="🌅 Breakfast"
          meal={data.breakfast}
        />

        <MealCard
          title="☀️ Lunch"
          meal={data.lunch}
        />

        <MealCard
          title="🌙 Dinner"
          meal={data.dinner}
        />
      </div>

      {Array.isArray(data.snacks) && data.snacks.length > 0 && (
        <div className="mt-3">
          <h4 className="text-white font-bold mb-2">
            🍎 Snacks
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {data.snacks.map((snack, index) => (
              <MealCard
                key={index}
                title={`Snack ${index + 1}`}
                meal={snack}
              />
            ))}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onToggleComplete}
        disabled={loading}
        className={`w-full mt-4 rounded-xl px-4 py-3 font-semibold transition ${
          completed
            ? 'bg-green-600 hover:bg-green-700'
            : 'bg-indigo-600 hover:bg-indigo-700'
        } text-white disabled:bg-slate-700 disabled:cursor-not-allowed`}
      >
        {loading
          ? 'Saving...'
          : completed
          ? '✓ Diet Day Completed'
          : 'Mark Diet Day Complete'}
      </button>
    </div>
  );
}

function DietSection({
  diet,
  activity,
  activityLoading,
  onToggleComplete,
}: {
  diet: PlanRow;
  activity: Record<string, boolean>;
  activityLoading: Record<string, boolean>;
  onToggleComplete: (day: string) => void;
}) {
  const data = normalizePlanData(diet.plan_data);

  return (
    <section className="bg-slate-900 border border-slate-700 rounded-2xl p-4 sm:p-6 mb-6">
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-white">
          🥗 Diet - Week {diet.week_number}
        </h2>

        <p className="text-slate-400 mt-1">
          Your personalized 7-day diet plan
        </p>
      </div>

      <div className="space-y-6">
        {DAYS.map((day) => {
          const dayData: DietDay = data?.[day] || {};

          return (
            <DietDayCard
              key={day}
              day={day}
              data={dayData}
              completed={Boolean(activity[day])}
              loading={Boolean(activityLoading[day])}
              onToggleComplete={() => onToggleComplete(day)}
            />
          );
        })}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const {
    isLoaded,
    isSignedIn,
    user,
  } = useUser();

  const { getToken } = useAuth();
  const { signOut } = useClerk();

  const supabase = useMemo(
    () => createSupabaseClient(getToken),
    [getToken]
  );

  const [profile, setProfile] = useState<Profile | null>(null);
  const [workout, setWorkout] = useState<PlanRow | null>(null);
  const [diet, setDiet] = useState<PlanRow | null>(null);

  const [workoutActivity, setWorkoutActivity] =
    useState<Record<string, boolean>>({});

  const [dietActivity, setDietActivity] =
    useState<Record<string, boolean>>({});

  const [workoutActivityLoading, setWorkoutActivityLoading] =
    useState<Record<string, boolean>>({});

  const [dietActivityLoading, setDietActivityLoading] =
    useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      router.push('/login');
      return;
    }

    async function loadDashboard() {
      setLoading(true);

      try {
        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('*')
          .eq('clerk_user_id', user.id)
          .maybeSingle();

        if (profileError) {
          console.error(
            'Profile fetch error:',
            profileError
          );

          alert(
            `Profile fetch failed: ${profileError.message}`
          );

          return;
        }

        if (!profileData) {
          console.error(
            'Profile not found for Clerk user:',
            user.id
          );

          router.push('/onboarding');
          return;
        }

        setProfile(profileData);

        const {
          data: workoutData,
          error: workoutError,
        } = await supabase
          .from('workout_plans')
          .select('*')
          .eq('user_id', profileData.id)
          .eq('is_active', true)
          .order('created_at', {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (workoutError) {
          console.error(
            'Workout fetch error:',
            workoutError
          );
        }

        const {
          data: dietData,
          error: dietError,
        } = await supabase
          .from('diet_plans')
          .select('*')
          .eq('user_id', profileData.id)
          .eq('is_active', true)
          .order('created_at', {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (dietError) {
          console.error(
            'Diet fetch error:',
            dietError
          );
        }

        setWorkout(workoutData);
        setDiet(dietData);

        if (workoutData) {
          const {
            data: activityData,
            error: activityError,
          } = await supabase
            .from('workout_activity')
            .select('*')
            .eq('user_id', profileData.id)
            .eq('workout_plan_id', workoutData.id)
            .eq('week_number', workoutData.week_number);

          if (activityError) {
            console.error(
              'Workout activity fetch error:',
              activityError
            );
          } else {
            const activityMap: Record<string, boolean> = {};

            (activityData || []).forEach((row: any) => {
              if (row.day) {
                activityMap[row.day] = Boolean(
                  row.completed
                );
              }
            });

            setWorkoutActivity(activityMap);
          }
        }

        if (dietData) {
          const {
            data: activityData,
            error: activityError,
          } = await supabase
            .from('diet_activity')
            .select('*')
            .eq('user_id', profileData.id)
            .eq('diet_plan_id', dietData.id)
            .eq('week_number', dietData.week_number);

          if (activityError) {
            console.error(
              'Diet activity fetch error:',
              activityError
            );
          } else {
            const activityMap: Record<string, boolean> = {};

            (activityData || []).forEach((row: any) => {
              if (row.day) {
                activityMap[row.day] = Boolean(
                  row.completed
                );
              }
            });

            setDietActivity(activityMap);
          }
        }
      } catch (error) {
        console.error(
          'Dashboard loading error:',
          error
        );

        alert(
          error instanceof Error
            ? error.message
            : 'Failed to load dashboard.'
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [
    isLoaded,
    isSignedIn,
    user,
    router,
    supabase,
  ]);

  async function toggleWorkoutComplete(day: string) {
    if (!profile || !workout) return;
    if (workoutActivityLoading[day]) return;

    setWorkoutActivityLoading((prev) => ({
      ...prev,
      [day]: true,
    }));

    try {
      const currentCompleted =
        Boolean(workoutActivity[day]);

      const {
        data: existing,
        error: findError,
      } = await supabase
        .from('workout_activity')
        .select('id')
        .eq('user_id', profile.id)
        .eq('workout_plan_id', workout.id)
        .eq('week_number', workout.week_number)
        .eq('day', day)
        .maybeSingle();

      if (findError) {
        throw new Error(
          `Workout activity lookup failed: ${findError.message}`
        );
      }

      const newCompleted = !currentCompleted;

      if (existing) {
        const { error } = await supabase
          .from('workout_activity')
          .update({
            completed: newCompleted,
            completed_at: newCompleted
              ? new Date().toISOString()
              : null,
          })
          .eq('id', existing.id);

        if (error) {
          throw new Error(
            `Workout activity update failed: ${error.message}`
          );
        }
      } else {
        const { error } = await supabase
          .from('workout_activity')
          .insert({
            user_id: profile.id,
            workout_plan_id: workout.id,
            week_number: workout.week_number,
            day,
            completed: newCompleted,
            completed_at: newCompleted
              ? new Date().toISOString()
              : null,
          });

        if (error) {
          throw new Error(
            `Workout activity insert failed: ${error.message}`
          );
        }
      }

      setWorkoutActivity((prev) => ({
        ...prev,
        [day]: newCompleted,
      }));
    } catch (error) {
      console.error(
        'Workout activity error:',
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : 'Failed to update workout activity.'
      );
    } finally {
      setWorkoutActivityLoading((prev) => ({
        ...prev,
        [day]: false,
      }));
    }
  }

  async function toggleDietComplete(day: string) {
    if (!profile || !diet) return;
    if (dietActivityLoading[day]) return;

    setDietActivityLoading((prev) => ({
      ...prev,
      [day]: true,
    }));

    try {
      const currentCompleted =
        Boolean(dietActivity[day]);

      const {
        data: existing,
        error: findError,
      } = await supabase
        .from('diet_activity')
        .select('id')
        .eq('user_id', profile.id)
        .eq('diet_plan_id', diet.id)
        .eq('week_number', diet.week_number)
        .eq('day', day)
        .maybeSingle();

      if (findError) {
        throw new Error(
          `Diet activity lookup failed: ${findError.message}`
        );
      }

      const newCompleted = !currentCompleted;

      if (existing) {
        const { error } = await supabase
          .from('diet_activity')
          .update({
            completed: newCompleted,
            completed_at: newCompleted
              ? new Date().toISOString()
              : null,
          })
          .eq('id', existing.id);

        if (error) {
          throw new Error(
            `Diet activity update failed: ${error.message}`
          );
        }
      } else {
        const { error } = await supabase
          .from('diet_activity')
          .insert({
            user_id: profile.id,
            diet_plan_id: diet.id,
            week_number: diet.week_number,
            day,
            completed: newCompleted,
            completed_at: newCompleted
              ? new Date().toISOString()
              : null,
          });

        if (error) {
          throw new Error(
            `Diet activity insert failed: ${error.message}`
          );
        }
      }

      setDietActivity((prev) => ({
        ...prev,
        [day]: newCompleted,
      }));
    } catch (error) {
      console.error(
        'Diet activity error:',
        error
      );

      alert(
        error instanceof Error
          ? error.message
          : 'Failed to update diet activity.'
      );
    } finally {
      setDietActivityLoading((prev) => ({
        ...prev,
        [day]: false,
      }));
    }
  }

  async function handleGeneratePlan() {
    if (generating) return;

    setGenerating(true);

    try {
      const response = await fetch(
        '/api/generate-plan',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error(
          'Generate plan API error:',
          data
        );

        alert(
          data?.error ||
            'Failed to generate your plan.'
        );

        return;
      }

      if (!data?.workout || !data?.diet) {
        alert(
          'Plan generated but the returned data is incomplete.'
        );

        return;
      }

      setWorkout(data.workout);
      setDiet(data.diet);

      setWorkoutActivity({});
      setDietActivity({});
    } catch (error) {
      console.error(
        'Generate plan request error:',
        error
      );

      alert(
        'Network error. Please try again.'
      );
    } finally {
      setGenerating(false);
    }
  }

  async function handleLogout() {
    await signOut();
    router.push('/login');
  }

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-3">
            ⚡
          </div>

          <p className="text-slate-300">
            Loading your dashboard...
          </p>
        </div>
      </main>
    );
  }

  const hasPlan = Boolean(workout || diet);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <header className="flex items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Welcome,{' '}
              {profile?.full_name ||
                user?.firstName ||
                'there'}{' '}
              👋
            </h1>

            <p className="text-slate-400 mt-1">
              Your personalized FitAdapt plan
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="shrink-0 px-4 py-2.5 bg-red-500 hover:bg-red-600 rounded-xl font-semibold transition"
          >
            Logout
          </button>
        </header>

        {!hasPlan && (
          <section className="bg-slate-900 border border-slate-700 rounded-2xl p-6 sm:p-8 text-center">
            <div className="text-5xl mb-4">
              🚀
            </div>

            <h2 className="text-2xl font-bold mb-2">
              No Active Plan
            </h2>

            <p className="text-slate-400 mb-6">
              Generate your personalized workout
              and diet plan based on your profile.
            </p>

            <button
              type="button"
              onClick={handleGeneratePlan}
              disabled={generating}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl font-bold transition"
            >
              {generating
                ? 'Generating...'
                : '🚀 Generate My First Plan'}
            </button>
          </section>
        )}

        {hasPlan && (
          <>
            {workout && (
              <WorkoutSection
                workout={workout}
                activity={workoutActivity}
                activityLoading={
                  workoutActivityLoading
                }
                onToggleComplete={
                  toggleWorkoutComplete
                }
              />
            )}

            {diet && (
              <DietSection
                diet={diet}
                activity={dietActivity}
                activityLoading={
                  dietActivityLoading
                }
                onToggleComplete={
                  toggleDietComplete
                }
              />
            )}

            <div className="text-center pb-10">
              <button
                type="button"
                onClick={handleGeneratePlan}
                disabled={generating}
                className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-xl font-semibold transition"
              >
                {generating
                  ? 'Generating...'
                  : '🔄 Regenerate Plan'}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
