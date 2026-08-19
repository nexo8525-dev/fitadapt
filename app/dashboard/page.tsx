// app/dashboard/page.tsx

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Dumbbell,
  Flame,
  LogOut,
  RefreshCw,
  Sparkles,
  Target,
  Utensils,
  X,
  Zap,
} from 'lucide-react';

import { useUser } from '@clerk/nextjs';
import { supabase } from '@/lib/supabase';

// ============================================================
// Types
// ============================================================

type WorkoutDifficulty =
  | 'Too Easy'
  | 'Just Right'
  | 'Too Hard';

interface Profile {
  id: string;
  clerk_user_id: string;
  initial_weight_kg: number | null;
  age?: number | null;
  height_cm?: number | null;
  goal?: string | null;
  equipment?: string | null;
  diet_preference?: string | null;
  budget?: number | null;
}

interface WorkoutPlan {
  id: string;
  user_id: string;
  week_number: number;
  plan_data: unknown;
  is_active: boolean;
  created_at?: string;
}

interface DietPlan {
  id: string;
  user_id: string;
  week_number: number;
  plan_data: unknown;
  is_active: boolean;
  created_at?: string;
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

interface Exercise {
  name?: string;
  exercise?: string;
  sets?: number | string;
  reps?: number | string;
  rest_seconds?: number | string;
  rest?: number | string;
  notes?: string;
}

interface WorkoutDay {
  focus?: string;
  duration_minutes?: number | string;
  duration?: number | string;
  exercises?: Exercise[];
}

interface Meal {
  meal?: string;
  name?: string;
  calories?: number | string;
  protein_g?: number | string;
  protein?: number | string;
}

interface DietDay {
  breakfast?: Meal | Meal[];
  lunch?: Meal | Meal[];
  dinner?: Meal | Meal[];
  snacks?: Meal[];
  daily_total_calories?: number | string;
  total_calories?: number | string;
  daily_total_protein_g?: number | string;
  total_protein_g?: number | string;
}

interface ActivityMap {
  [day: string]: boolean;
}

// ============================================================
// Constants
// ============================================================

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

const DEFAULT_WORKOUT_DAY: WorkoutDay = {
  focus: 'Recovery / Rest',
  duration_minutes: 0,
  exercises: [],
};

const DEFAULT_DIET_DAY: DietDay = {
  breakfast: [],
  lunch: [],
  dinner: [],
  snacks: [],
  daily_total_calories: 0,
  daily_total_protein_g: 0,
};

// ============================================================
// Helpers
// ============================================================

function isObject(
  value: unknown
): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function toNumber(
  value: unknown,
  fallback = 0
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function formatNumber(
  value: unknown,
  fallback = '0'
): string {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Number.isInteger(number)
    ? String(number)
    : number.toFixed(1);
}

function getPlanData<T>(
  planData: unknown
): Record<string, T> {
  if (!isObject(planData)) {
    return {};
  }

  // Handles:
  // { Monday: {...}, Tuesday: {...} }
  if (
    DAYS.some(
      (day) =>
        Object.prototype.hasOwnProperty.call(
          planData,
          day
        )
    )
  ) {
    return planData as Record<string, T>;
  }

  // Also handles accidental:
  // { workout: { Monday: {...} } }
  // { diet: { Monday: {...} } }
  if (
    isObject(planData.workout) &&
    DAYS.some((day) =>
      Object.prototype.hasOwnProperty.call(
        planData.workout,
        day
      )
    )
  ) {
    return planData.workout as Record<string, T>;
  }

  if (
    isObject(planData.diet) &&
    DAYS.some((day) =>
      Object.prototype.hasOwnProperty.call(
        planData.diet,
        day
      )
    )
  ) {
    return planData.diet as Record<string, T>;
  }

  return {};
}

function getWorkoutDay(
  planData: unknown,
  day: string
): WorkoutDay {
  const data =
    getPlanData<WorkoutDay>(planData)[day];

  if (!isObject(data)) {
    return DEFAULT_WORKOUT_DAY;
  }

  return {
    focus:
      typeof data.focus === 'string'
        ? data.focus
        : 'Training',

    duration_minutes:
      data.duration_minutes ??
      data.duration ??
      0,

    exercises: Array.isArray(
      data.exercises
    )
      ? data.exercises
      : [],
  };
}

function getDietDay(
  planData: unknown,
  day: string
): DietDay {
  const data =
    getPlanData<DietDay>(planData)[day];

  if (!isObject(data)) {
    return DEFAULT_DIET_DAY;
  }

  return data;
}

function normalizeMeals(
  meal: Meal | Meal[] | undefined
): Meal[] {
  if (!meal) {
    return [];
  }

  if (Array.isArray(meal)) {
    return meal.filter(isObject);
  }

  if (isObject(meal)) {
    return [meal];
  }

  return [];
}

function mealName(meal: Meal): string {
  return (
    meal.meal ||
    meal.name ||
    'Meal'
  );
}

function mealCalories(meal: Meal): number {
  return toNumber(
    meal.calories,
    0
  );
}

function mealProtein(meal: Meal): number {
  return toNumber(
    meal.protein_g ??
      meal.protein,
    0
  );
}

// ============================================================
// Main Component
// ============================================================

export default function DashboardPage() {
  const {
    user,
    isLoaded: isUserLoaded,
    signOut,
  } = useUser();

  // ----------------------------------------------------------
  // Data state
  // ----------------------------------------------------------

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState('');

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [activeWorkout, setActiveWorkout] =
    useState<WorkoutPlan | null>(null);

  const [activeDiet, setActiveDiet] =
    useState<DietPlan | null>(null);

  const [latestCheckin, setLatestCheckin] =
    useState<WeeklyCheckin | null>(null);

  // ----------------------------------------------------------
  // Generation state
  // ----------------------------------------------------------

  const [generatingPlan, setGeneratingPlan] =
    useState(false);

  // ----------------------------------------------------------
  // Activity state
  // ----------------------------------------------------------

  const [workoutActivity, setWorkoutActivity] =
    useState<ActivityMap>({});

  const [dietActivity, setDietActivity] =
    useState<ActivityMap>({});

  const [activityLoading, setActivityLoading] =
    useState<string | null>(null);

  // ----------------------------------------------------------
  // UI state
  // ----------------------------------------------------------

  const [expandedWorkoutDay, setExpandedWorkoutDay] =
    useState<string | null>('Monday');

  const [expandedDietDay, setExpandedDietDay] =
    useState<string | null>('Monday');

  // ----------------------------------------------------------
  // Weekly review state
  // ----------------------------------------------------------

  const [modalOpen, setModalOpen] =
    useState(false);

  const [submittingReview, setSubmittingReview] =
    useState(false);

  const [submitError, setSubmitError] =
    useState('');

  const [formData, setFormData] =
    useState<{
      weight_kg: string;
      workout_difficulty: WorkoutDifficulty;
      energy_rating: number;
      user_notes: string;
    }>({
      weight_kg: '',
      workout_difficulty:
        'Just Right',
      energy_rating: 3,
      user_notes: '',
    });

  // ==========================================================
  // Fetch activities
  // ==========================================================

  const fetchActivities = useCallback(
    async (
      profileId: string,
      weekNumber: number
    ) => {
      const [
        workoutResult,
        dietResult,
      ] = await Promise.all([
        supabase
          .from('workout_activity')
          .select(
            'day, completed'
          )
          .eq(
            'user_id',
            profileId
          )
          .eq(
            'week_number',
            weekNumber
          ),

        supabase
          .from('diet_activity')
          .select(
            'day, completed'
          )
          .eq(
            'user_id',
            profileId
          )
          .eq(
            'week_number',
            weekNumber
          ),
      ]);

      if (workoutResult.error) {
        console.error(
          'Workout activity error:',
          workoutResult.error
        );
      }

      if (dietResult.error) {
        console.error(
          'Diet activity error:',
          dietResult.error
        );
      }

      const workoutMap: ActivityMap =
        {};

      const dietMap: ActivityMap =
        {};

      (
        workoutResult.data || []
      ).forEach(
        (row: any) => {
          if (
            typeof row.day ===
            'string'
          ) {
            workoutMap[
              row.day
            ] = Boolean(
              row.completed
            );
          }
        }
      );

      (
        dietResult.data || []
      ).forEach(
        (row: any) => {
          if (
            typeof row.day ===
            'string'
          ) {
            dietMap[
              row.day
            ] = Boolean(
              row.completed
            );
          }
        }
      );

      setWorkoutActivity(
        workoutMap
      );

      setDietActivity(
        dietMap
      );
    },
    []
  );

  // ==========================================================
  // Fetch dashboard data
  // ==========================================================

  const fetchData = useCallback(
    async () => {
      if (!user) {
        return;
      }

      setLoading(true);
      setError('');

      try {
        // ----------------------------------------------------
        // Profile
        // ----------------------------------------------------

        const {
          data: profileData,
          error: profileError,
        } = await supabase
          .from('profiles')
          .select('*')
          .eq(
            'clerk_user_id',
            user.id
          )
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        if (!profileData) {
          throw new Error(
            'Your profile was not found. Please complete onboarding first.'
          );
        }

        setProfile(
          profileData
        );

        // ----------------------------------------------------
        // Active plans
        // ----------------------------------------------------

        const [
          workoutResult,
          dietResult,
          checkinResult,
        ] = await Promise.all([
          supabase
            .from('workout_plans')
            .select('*')
            .eq(
              'user_id',
              profileData.id
            )
            .eq(
              'is_active',
              true
            )
            .maybeSingle(),

          supabase
            .from('diet_plans')
            .select('*')
            .eq(
              'user_id',
              profileData.id
            )
            .eq(
              'is_active',
              true
            )
            .maybeSingle(),

          supabase
            .from('weekly_checkins')
            .select('*')
            .eq(
              'user_id',
              profileData.id
            )
            .order(
              'created_at',
              {
                ascending: false,
              }
            )
            .limit(1)
            .maybeSingle(),
        ]);

        if (workoutResult.error) {
          throw workoutResult.error;
        }

        if (dietResult.error) {
          throw dietResult.error;
        }

        if (checkinResult.error) {
          throw checkinResult.error;
        }

        setActiveWorkout(
          workoutResult.data ||
            null
        );

        setActiveDiet(
          dietResult.data ||
            null
        );

        setLatestCheckin(
          checkinResult.data ||
            null
        );

        // ----------------------------------------------------
        // Prefill weight
        // ----------------------------------------------------

        if (
          checkinResult.data
        ) {
          setFormData(
            (previous) => ({
              ...previous,
              weight_kg:
                String(
                  checkinResult
                    .data
                    .weight_kg
                ),
            })
          );
        } else if (
          profileData.initial_weight_kg !=
          null
        ) {
          setFormData(
            (previous) => ({
              ...previous,
              weight_kg:
                String(
                  profileData.initial_weight_kg
                ),
            })
          );
        }

        // ----------------------------------------------------
        // Activities
        // ----------------------------------------------------

        const weekNumber =
          workoutResult.data
            ?.week_number ??
          dietResult.data
            ?.week_number;

        if (weekNumber) {
          await fetchActivities(
            profileData.id,
            weekNumber
          );
        } else {
          setWorkoutActivity(
            {}
          );
          setDietActivity(
            {}
          );
        }
      } catch (err: any) {
        console.error(
          'Dashboard fetch error:',
          err
        );

        setError(
          err?.message ||
            'Failed to load dashboard.'
        );
      } finally {
        setLoading(false);
      }
    },
    [
      user,
      fetchActivities,
    ]
  );

  // ==========================================================
  // Initial load
  // ==========================================================

  useEffect(() => {
    if (
      isUserLoaded &&
      user
    ) {
      fetchData();
    }
  }, [
    isUserLoaded,
    user,
    fetchData,
  ]);

  // ==========================================================
  // Generate first plan
  // ==========================================================

  const handleGeneratePlan =
    async () => {
      if (!user) {
        return;
      }

      setGeneratingPlan(
        true
      );
      setError('');

      try {
        const response =
          await fetch(
            '/api/generate-plan',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify(
                {
                  week_number: 1,
                }
              ),
            }
          );

        let data: any = null;

        try {
          data =
            await response.json();
        } catch {
          data = null;
        }

        if (!response.ok) {
          throw new Error(
            data?.error ||
              'Failed to generate your plan.'
          );
        }

        await fetchData();
      } catch (err: any) {
        console.error(
          'Generate plan error:',
          err
        );

        setError(
          err?.message ||
            'Unable to generate your plan.'
        );
      } finally {
        setGeneratingPlan(
          false
        );
      }
    };

  // ==========================================================
  // Toggle activity
  // ==========================================================

  const toggleActivity =
    async (
      type:
        | 'workout'
        | 'diet',
      day: string
    ) => {
      if (
        !profile ||
        !currentWeek
      ) {
        return;
      }

      const key =
        `${type}-${day}`;

      setActivityLoading(
        key
      );

      const currentValue =
        type === 'workout'
          ? Boolean(
              workoutActivity[
                day
              ]
            )
          : Boolean(
              dietActivity[
                day
              ]
            );

      const nextValue =
        !currentValue;

      try {
        const table =
          type === 'workout'
            ? 'workout_activity'
            : 'diet_activity';

        // ----------------------------------------------------
        // Look for an existing row first.
        // This avoids requiring a specific UNIQUE constraint.
        // ----------------------------------------------------

        const {
          data: existing,
          error: findError,
        } = await supabase
          .from(table)
          .select('id')
          .eq(
            'user_id',
            profile.id
          )
          .eq(
            'week_number',
            currentWeek
          )
          .eq(
            'day',
            day
          )
          .maybeSingle();

        if (findError) {
          throw findError;
        }

        if (existing?.id) {
          const {
            error: updateError,
          } = await supabase
            .from(table)
            .update({
              completed:
                nextValue,
            })
            .eq(
              'id',
              existing.id
            );

          if (updateError) {
            throw updateError;
          }
        } else {
          const {
            error: insertError,
          } = await supabase
            .from(table)
            .insert({
              user_id:
                profile.id,
              week_number:
                currentWeek,
              day,
              completed:
                nextValue,
            });

          if (insertError) {
            throw insertError;
          }
        }

        // ----------------------------------------------------
        // Update UI immediately
        // ----------------------------------------------------

        if (
          type === 'workout'
        ) {
          setWorkoutActivity(
            (previous) => ({
              ...previous,
              [day]:
                nextValue,
            })
          );
        } else {
          setDietActivity(
            (previous) => ({
              ...previous,
              [day]:
                nextValue,
            })
          );
        }
      } catch (err: any) {
        console.error(
          'Activity update error:',
          err
        );

        setError(
          err?.message ||
            `Failed to update ${type} activity.`
        );
      } finally {
        setActivityLoading(
          null
        );
      }
    };

  // ==========================================================
  // Weekly review submit
  // ==========================================================

  const handleReviewSubmit =
    async (
      event: React.FormEvent
    ) => {
      event.preventDefault();

      if (!currentWeek) {
        return;
      }

      setSubmittingReview(
        true
      );
      setSubmitError('');

      try {
        const weight =
          Number(
            formData.weight_kg
          );

        if (
          !Number.isFinite(
            weight
          ) ||
          weight <= 0
        ) {
          throw new Error(
            'Please enter a valid weight.'
          );
        }

        const response =
          await fetch(
            '/api/weekly-checkin',
            {
              method: 'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify(
                {
                  weight_kg:
                    weight,
                  workout_difficulty:
                    formData.workout_difficulty,
                  energy_rating:
                    formData.energy_rating,
                  user_notes:
                    formData.user_notes,
                }
              ),
            }
          );

        let data: any = null;

        try {
          data =
            await response.json();
        } catch {
          data = null;
        }

        if (!response.ok) {
          throw new Error(
            data?.error ||
              'Weekly review failed.'
          );
        }

        setModalOpen(
          false
        );

        setFormData(
          (previous) => ({
            ...previous,
            user_notes: '',
          })
        );

        await fetchData();
      } catch (err: any) {
        console.error(
          'Weekly review error:',
          err
        );

        setSubmitError(
          err?.message ||
            'Something went wrong.'
        );
      } finally {
        setSubmittingReview(
          false
        );
      }
    };

  // ==========================================================
  // Derived values
  // ==========================================================

  const currentWeek =
    activeWorkout?.week_number ??
    activeDiet?.week_number ??
    0;

  const hasWorkout =
    Boolean(
      activeWorkout
    );

  const hasDiet =
    Boolean(activeDiet);

  const hasAnyPlan =
    hasWorkout ||
    hasDiet;

  const workoutPlanData =
    useMemo(
      () =>
        activeWorkout
          ? activeWorkout.plan_data
          : {},
      [activeWorkout]
    );

  const dietPlanData =
    useMemo(
      () =>
        activeDiet
          ? activeDiet.plan_data
          : {},
      [activeDiet]
    );

  const completedWorkoutCount =
    DAYS.filter(
      (day) =>
        workoutActivity[
          day
        ]
    ).length;

  const completedDietCount =
    DAYS.filter(
      (day) =>
        dietActivity[
          day
        ]
    ).length;

  // ==========================================================
  // Loading
  // ==========================================================

  if (
    !isUserLoaded ||
    loading
  ) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-700 border-t-indigo-500" />

          <p className="text-sm text-slate-400">
            Loading your dashboard...
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // Not authenticated
  // ==========================================================

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-xl font-bold">
            Please sign in
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            You need to be signed in to view your dashboard.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // Empty state
  // ==========================================================

  if (!hasAnyPlan) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
        <header className="mx-auto max-w-6xl flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Dashboard
            </h1>

            <p className="mt-1 text-slate-400">
              Welcome back,{' '}
              {user.firstName ||
                user.fullName ||
                'User'}
            </p>
          </div>

          <button
            onClick={() =>
              signOut()
            }
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <LogOut
              size={16}
            />
            Logout
          </button>
        </header>

        {error && (
          <div className="mx-auto mt-6 max-w-6xl rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <main className="mx-auto mt-10 max-w-3xl">
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-8 text-center shadow-2xl md:p-12">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-600/10 ring-1 ring-indigo-500/20">
              <Sparkles
                size={38}
                className="text-indigo-400"
              />
            </div>

            <h2 className="mt-6 text-2xl font-bold text-white md:text-3xl">
              No Active Plan Found
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-400 md:text-base">
              Your FitAdapt journey starts here.
              Generate your personalized 7-day
              workout and diet plan using your
              profile, goals, equipment and
              preferences.
            </p>

            {generatingPlan ? (
              <div className="mt-8 rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-6">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600/20">
                  <RefreshCw
                    size={24}
                    className="animate-spin text-indigo-400"
                  />
                </div>

                <p className="mt-4 font-semibold text-indigo-300">
                  AI Coach is crafting your
                  7-day plan...
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  This can take a few seconds.
                </p>
              </div>
            ) : (
              <button
                onClick={
                  handleGeneratePlan
                }
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                <Sparkles
                  size={18}
                />
                🚀 Generate My First AI Plan
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ==========================================================
  // Full dashboard
  // ==========================================================

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl p-5 md:p-8">
        {/* ====================================================
            Header
        ==================================================== */}

        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                Dashboard
              </h1>

              <span className="inline-flex items-center rounded-full bg-indigo-950/60 px-3 py-1 text-sm font-semibold text-indigo-300 ring-1 ring-indigo-500/30">
                Active: Week{' '}
                {currentWeek}
              </span>
            </div>

            <p className="mt-1 text-slate-400">
              Welcome back,{' '}
              {user.firstName ||
                user.fullName ||
                'User'}
            </p>
          </div>

          <button
            onClick={() =>
              signOut()
            }
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white"
          >
            <LogOut
              size={16}
            />
            Logout
          </button>
        </header>

        {/* ====================================================
            Error
        ==================================================== */}

        {error && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-950/30 p-4">
            <X
              size={18}
              className="mt-0.5 shrink-0 text-red-400"
            />

            <div className="text-sm text-red-300">
              {error}
            </div>

            <button
              onClick={() =>
                setError('')
              }
              className="ml-auto text-red-400 hover:text-red-200"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* ====================================================
            AI Insight
        ==================================================== */}

        {latestCheckin?.ai_analysis && (
          <section className="mb-8 rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-5 shadow-lg shadow-emerald-950/10">
            <div className="flex gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                <Sparkles
                  size={22}
                  className="text-emerald-400"
                />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-emerald-300">
                    Coach AI Review
                  </h2>

                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                    Week{' '}
                    {
                      latestCheckin.week_number
                    }
                  </span>
                </div>

                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {
                    latestCheckin.ai_analysis
                  }
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ====================================================
            Progress overview
        ==================================================== */}

        <section className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">
                Workout Progress
              </span>

              <Dumbbell
                size={18}
                className="text-indigo-400"
              />
            </div>

            <p className="mt-3 text-2xl font-bold">
              {
                completedWorkoutCount
              }
              <span className="text-base font-normal text-slate-500">
                {' '}
                / 7
              </span>
            </p>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-600 transition-all"
                style={{
                  width: `${
                    (completedWorkoutCount /
                      7) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">
                Diet Progress
              </span>

              <Utensils
                size={18}
                className="text-emerald-400"
              />
            </div>

            <p className="mt-3 text-2xl font-bold">
              {
                completedDietCount
              }
              <span className="text-base font-normal text-slate-500">
                {' '}
                / 7
              </span>
            </p>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${
                    (completedDietCount /
                      7) *
                    100
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">
                Current Weight
              </span>

              <Target
                size={18}
                className="text-amber-400"
              />
            </div>

            <p className="mt-3 text-2xl font-bold">
              {latestCheckin
                ? formatNumber(
                    latestCheckin.weight_kg
                  )
                : profile?.initial_weight_kg
                  ? formatNumber(
                      profile.initial_weight_kg
                    )
                  : '—'}
              <span className="ml-1 text-sm font-normal text-slate-500">
                kg
              </span>
            </p>
          </div>
        </section>

        {/* ====================================================
            Workout
        ==================================================== */}

        {hasWorkout && (
          <section className="mb-10">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Dumbbell
                    size={22}
                    className="text-indigo-400"
                  />

                  <h2 className="text-2xl font-bold">
                    Workout Plan
                  </h2>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Week{' '}
                  {
                    activeWorkout!.week_number
                  }{' '}
                  • Complete each session to track adherence.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {DAYS.map(
                (day) => {
                  const workout =
                    getWorkoutDay(
                      workoutPlanData,
                      day
                    );

                  const completed =
                    Boolean(
                      workoutActivity[
                        day
                      ]
                    );

                  const expanded =
                    expandedWorkoutDay ===
                    day;

                  const activityKey =
                    `workout-${day}`;

                  return (
                    <div
                      key={day}
                      className={`overflow-hidden rounded-2xl border bg-slate-900 transition ${
                        completed
                          ? 'border-indigo-500/30'
                          : 'border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedWorkoutDay(
                              expanded
                                ? null
                                : day
                            )
                          }
                          className="flex min-w-0 items-center gap-4 text-left"
                        >
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                              completed
                                ? 'bg-indigo-600 text-white'
                                : 'bg-indigo-500/10 text-indigo-400'
                            }`}
                          >
                            {completed ? (
                              <Check
                                size={20}
                              />
                            ) : (
                              <Dumbbell
                                size={20}
                              />
                            )}
                          </div>

                          <div className="min-w-0">
                            <h3 className="font-bold text-white">
                              {day}
                            </h3>

                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Target
                                  size={13}
                                />
                                {
                                  workout.focus
                                }
                              </span>

                              <span className="inline-flex items-center gap-1">
                                <Clock3
                                  size={13}
                                />
                                {
                                  workout.duration_minutes
                                }{' '}
                                min
                              </span>

                              <span>
                                {
                                  workout
                                    .exercises
                                    ?.length ??
                                  0
                                }{' '}
                                exercises
                              </span>
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              activityLoading ===
                              activityKey
                            }
                            onClick={() =>
                              toggleActivity(
                                'workout',
                                day
                              )
                            }
                            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              completed
                                ? 'bg-indigo-600/20 text-indigo-300 ring-1 ring-indigo-500/30 hover:bg-indigo-600/30'
                                : 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/10 hover:bg-indigo-500'
                            }`}
                          >
                            {activityLoading ===
                            activityKey ? (
                              <RefreshCw
                                size={15}
                                className="animate-spin"
                              />
                            ) : (
                              <Check
                                size={15}
                              />
                            )}

                            {completed
                              ? 'Completed'
                              : 'Mark Workout Complete'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedWorkoutDay(
                                expanded
                                  ? null
                                  : day
                              )
                            }
                            className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                            aria-label={`Toggle ${day}`}
                          >
                            {expanded ? (
                              <ChevronUp
                                size={18}
                              />
                            ) : (
                              <ChevronDown
                                size={18}
                              />
                            )}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="border-t border-slate-800 p-5">
                          {workout
                            .exercises
                            ?.length ? (
                            <div className="space-y-3">
                              {workout.exercises.map(
                                (
                                  exercise,
                                  index
                                ) => (
                                  <div
                                    key={`${day}-${index}`}
                                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-4"
                                  >
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                      <div>
                                        <h4 className="font-semibold text-white">
                                          {exercise.name ||
                                            exercise.exercise ||
                                            `Exercise ${index + 1}`}
                                        </h4>

                                        {exercise.notes && (
                                          <p className="mt-1 text-sm leading-5 text-slate-500">
                                            {
                                              exercise.notes
                                            }
                                          </p>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                        <div className="rounded-lg bg-slate-900 px-3 py-2">
                                          <p className="text-slate-500">
                                            Sets
                                          </p>
                                          <p className="mt-0.5 font-semibold text-indigo-300">
                                            {formatNumber(
                                              exercise.sets,
                                              '—'
                                            )}
                                          </p>
                                        </div>

                                        <div className="rounded-lg bg-slate-900 px-3 py-2">
                                          <p className="text-slate-500">
                                            Reps
                                          </p>
                                          <p className="mt-0.5 font-semibold text-indigo-300">
                                            {exercise.reps ??
                                              '—'}
                                          </p>
                                        </div>

                                        <div className="rounded-lg bg-slate-900 px-3 py-2">
                                          <p className="text-slate-500">
                                            Rest
                                          </p>
                                          <p className="mt-0.5 font-semibold text-indigo-300">
                                            {exercise.rest_seconds ??
                                              exercise.rest ??
                                              '—'}
                                            {exercise.rest_seconds ||
                                            exercise.rest
                                              ? 's'
                                              : ''}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              )}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5 text-center text-sm text-slate-500">
                              No exercises were provided for this day.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}

        {/* ====================================================
            Diet
        ==================================================== */}

        {hasDiet && (
          <section className="mb-10">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Utensils
                    size={22}
                    className="text-emerald-400"
                  />

                  <h2 className="text-2xl font-bold">
                    Diet Plan
                  </h2>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Week{' '}
                  {
                    activeDiet!.week_number
                  }{' '}
                  • Track your daily nutrition adherence.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {DAYS.map(
                (day) => {
                  const diet =
                    getDietDay(
                      dietPlanData,
                      day
                    );

                  const completed =
                    Boolean(
                      dietActivity[
                        day
                      ]
                    );

                  const expanded =
                    expandedDietDay ===
                    day;

                  const activityKey =
                    `diet-${day}`;

                  const meals = [
                    {
                      title:
                        'Breakfast',
                      items:
                        normalizeMeals(
                          diet.breakfast
                        ),
                    },
                    {
                      title:
                        'Lunch',
                      items:
                        normalizeMeals(
                          diet.lunch
                        ),
                    },
                    {
                      title:
                        'Dinner',
                      items:
                        normalizeMeals(
                          diet.dinner
                        ),
                    },
                    {
                      title:
                        'Snacks',
                      items:
                        normalizeMeals(
                          diet.snacks
                        ),
                    },
                  ];

                  return (
                    <div
                      key={day}
                      className={`overflow-hidden rounded-2xl border bg-slate-900 transition ${
                        completed
                          ? 'border-emerald-500/30'
                          : 'border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedDietDay(
                              expanded
                                ? null
                                : day
                            )
                          }
                          className="flex min-w-0 items-center gap-4 text-left"
                        >
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                              completed
                                ? 'bg-emerald-600 text-white'
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {completed ? (
                              <Check
                                size={20}
                              />
                            ) : (
                              <Utensils
                                size={20}
                              />
                            )}
                          </div>

                          <div className="min-w-0">
                            <h3 className="font-bold text-white">
                              {day}
                            </h3>

                            <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                              <span className="inline-flex items-center gap-1">
                                <Flame
                                  size={13}
                                />
                                {formatNumber(
                                  diet.daily_total_calories ??
                                    diet.total_calories,
                                  '0'
                                )}{' '}
                                kcal
                              </span>

                              <span className="inline-flex items-center gap-1">
                                <Zap
                                  size={13}
                                />
                                {formatNumber(
                                  diet.daily_total_protein_g ??
                                    diet.total_protein_g,
                                  '0'
                                )}
                                g protein
                              </span>
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={
                              activityLoading ===
                              activityKey
                            }
                            onClick={() =>
                              toggleActivity(
                                'diet',
                                day
                              )
                            }
                            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                              completed
                                ? 'bg-emerald-600/20 text-emerald-300 ring-1 ring-emerald-500/30 hover:bg-emerald-600/30'
                                : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/10 hover:bg-emerald-500'
                            }`}
                          >
                            {activityLoading ===
                            activityKey ? (
                              <RefreshCw
                                size={15}
                                className="animate-spin"
                              />
                            ) : (
                              <Check
                                size={15}
                              />
                            )}

                            {completed
                              ? 'Completed'
                              : 'Mark Diet Complete'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setExpandedDietDay(
                                expanded
                                  ? null
                                  : day
                              )
                            }
                            className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                            aria-label={`Toggle ${day}`}
                          >
                            {expanded ? (
                              <ChevronUp
                                size={18}
                              />
                            ) : (
                              <ChevronDown
                                size={18}
                              />
                            )}
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <div className="border-t border-slate-800 p-5">
                          <div className="grid gap-4 md:grid-cols-2">
                            {meals.map(
                              (
                                mealGroup
                              ) => (
                                <div
                                  key={
                                    mealGroup.title
                                  }
                                  className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                                >
                                  <h4 className="mb-3 flex items-center gap-2 font-semibold text-emerald-300">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    {
                                      mealGroup.title
                                    }
                                  </h4>

                                  {mealGroup
                                    .items
                                    .length >
                                  0 ? (
                                    <div className="space-y-2">
                                      {mealGroup.items.map(
                                        (
                                          meal,
                                          index
                                        ) => (
                                          <div
                                            key={`${mealGroup.title}-${index}`}
                                            className="flex items-start justify-between gap-4 rounded-lg bg-slate-900 p-3"
                                          >
                                            <div className="min-w-0">
                                              <p className="text-sm font-medium text-slate-200">
                                                {mealName(
                                                  meal
                                                )}
                                              </p>

                                              {meal.notes && (
                                                <p className="mt-1 text-xs text-slate-500">
                                                  {
                                                    (
                                                      meal as any
                                                    )
                                                      .notes
                                                  }
                                                </p>
                                              )}
                                            </div>

                                            <div className="shrink-0 text-right text-xs">
                                              <p className="text-slate-400">
                                                {formatNumber(
                                                  mealCalories(
                                                    meal
                                                  )
                                                )}{' '}
                                                kcal
                                              </p>

                                              <p className="mt-0.5 text-emerald-400">
                                                {formatNumber(
                                                  mealProtein(
                                                    meal
                                                  )
                                                )}
                                                g
                                                {' '}
                                                protein
                                              </p>
                                            </div>
                                          </div>
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <p className="text-sm text-slate-600">
                                      No items listed.
                                    </p>
                                  )}
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}

        {/* ====================================================
            Missing one plan
        ==================================================== */}

        {!hasWorkout ||
          (!hasDiet && (
            <section className="mb-10 rounded-2xl border border-amber-500/20 bg-amber-950/10 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-semibold text-amber-300">
                    Your plan is incomplete
                  </h3>

                  <p className="mt-1 text-sm text-slate-500">
                    One of your active plans is missing.
                    Generate a new plan to restore it.
                  </p>
                </div>

                <button
                  onClick={
                    handleGeneratePlan
                  }
                  disabled={
                    generatingPlan
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  {generatingPlan ? (
                    <RefreshCw
                      size={16}
                      className="animate-spin"
                    />
                  ) : (
                    <Sparkles
                      size={16}
                    />
                  )}
                  Generate Plan
                </button>
              </div>
            </section>
          ))}

        {/* ====================================================
            Weekly review
        ==================================================== */}

        <section className="mt-12 border-t border-slate-800 pt-8">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/10 p-6 text-center">
            <Sparkles
              size={28}
              className="mx-auto text-indigo-400"
            />

            <h2 className="mt-3 text-xl font-bold">
              Ready to review your week?
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
              Your feedback helps the AI coach adjust
              your next workout and diet plan.
            </p>

            <button
              onClick={() => {
                setSubmitError('');
                setModalOpen(
                  true
                );
              }}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-500"
            >
              🏁 Complete Week{' '}
              {currentWeek} & Review
            </button>
          </div>
        </section>
      </div>

      {/* ======================================================
          Weekly Review Modal
      ====================================================== */}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="weekly-review-title"
        >
          <div className="my-auto w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl md:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="weekly-review-title"
                  className="text-2xl font-bold text-white"
                >
                  Weekly Check-In
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Review Week{' '}
                  {currentWeek} before your AI coach creates the next week.
                </p>
              </div>

              <button
                type="button"
                disabled={
                  submittingReview
                }
                onClick={() =>
                  setModalOpen(
                    false
                  )
                }
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form
              onSubmit={
                handleReviewSubmit
              }
              className="mt-6 space-y-5"
            >
              {/* Weight */}

              <div>
                <label className="block text-sm font-semibold text-slate-300">
                  Current Weight (kg)
                </label>

                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  required
                  value={
                    formData.weight_kg
                  }
                  onChange={(event) =>
                    setFormData(
                      (
                        previous
                      ) => ({
                        ...previous,
                        weight_kg:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                  placeholder="e.g. 65.5"
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Difficulty */}

              <div>
                <label className="block text-sm font-semibold text-slate-300">
                  Workout Difficulty
                </label>

                <select
                  value={
                    formData.workout_difficulty
                  }
                  onChange={(event) =>
                    setFormData(
                      (
                        previous
                      ) => ({
                        ...previous,
                        workout_difficulty:
                          event
                            .target
                            .value as WorkoutDifficulty,
                      })
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="Too Easy">
                    Too Easy
                  </option>

                  <option value="Just Right">
                    Just Right
                  </option>

                  <option value="Too Hard">
                    Too Hard
                  </option>
                </select>
              </div>

              {/* Energy */}

              <div>
                <label className="block text-sm font-semibold text-slate-300">
                  Energy Level
                </label>

                <div className="mt-2 grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map(
                    (number) => (
                      <button
                        key={
                          number
                        }
                        type="button"
                        onClick={() =>
                          setFormData(
                            (
                              previous
                            ) => ({
                              ...previous,
                              energy_rating:
                                number,
                            })
                          )
                        }
                        className={`rounded-xl py-3 text-sm font-bold transition ${
                          formData.energy_rating ===
                          number
                            ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {number}
                      </button>
                    )
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-600">
                  1 = very low energy • 5 = excellent energy
                </p>
              </div>

              {/* Notes */}

              <div>
                <label className="block text-sm font-semibold text-slate-300">
                  Notes / Feedback
                </label>

                <textarea
                  rows={4}
                  value={
                    formData.user_notes
                  }
                  onChange={(event) =>
                    setFormData(
                      (
                        previous
                      ) => ({
                        ...previous,
                        user_notes:
                          event
                            .target
                            .value,
                      })
                    )
                  }
                  placeholder="How did the week feel? What should the AI coach know?"
                  className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Error */}

              {submitError && (
                <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-sm text-red-300">
                  {submitError}
                </div>
              )}

              {/* Buttons */}

              <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={
                    submittingReview
                  }
                  onClick={() =>
                    setModalOpen(
                      false
                    )
                  }
                  className="rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    submittingReview
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submittingReview ? (
                    <>
                      <RefreshCw
                        size={17}
                        className="animate-spin"
                      />
                      AI Coach is analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles
                        size={17}
                      />
                      Submit Review
                    </>
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
