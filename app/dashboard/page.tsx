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
  Loader2,
  LogOut,
  RefreshCw,
  Sparkles,
  Target,
  Utensils,
  X,
  Zap,
  CalendarDays,
  CheckCircle2,
  Moon,
  ListChecks
} from 'lucide-react';

import {
  useAuth,
  useClerk,
  useUser,
} from '@clerk/nextjs';

// ============================================================
// Types
// ============================================================

type WorkoutDifficulty = 'Too Easy' | 'Just Right' | 'Too Hard';

interface Profile {
  id: string;
  clerk_user_id: string;
  initial_weight_kg?: number | null;
  weight_kg?: number | null;
  age?: number | null;
  height_cm?: number | null;
  goal?: string | null;
  fitness_goal?: string | null;
  equipment?: string | null;
  workout_location?: string | null;
  diet_preference?: string | null;
  dietary_preference?: string | null;
  budget?: number | null;
  diet_budget_per_month?: number | null;
}

interface WorkoutPlan {
  id: string;
  user_id: string;
  week_number: number;
  plan_data: any;
  is_active: boolean;
  created_at?: string;
}

interface DietPlan {
  id: string;
  user_id: string;
  week_number: number;
  plan_data: any;
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

interface DashboardResponse {
  hasProfile: boolean;
  profile: Profile | null;
  workout: WorkoutPlan | null;
  diet: DietPlan | null;
  workoutActivity: any[];
  dietActivity: any[];
  latestReview: WeeklyCheckin | null;
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
  snacks?: Meal | Meal[];
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

// ============================================================
// Helpers
// ============================================================

function isObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function displayNumber(value: unknown, fallback = '0'): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function getPlanDays<T>(planData: unknown): Record<string, T> {
  if (!isObject(planData)) return {};
  const hasDays = DAYS.some((day) => Object.prototype.hasOwnProperty.call(planData, day));
  if (hasDays) return planData as Record<string, T>;
  if (isObject(planData.workout) && DAYS.some((day) => Object.prototype.hasOwnProperty.call(planData.workout, day))) {
    return planData.workout as Record<string, T>;
  }
  if (isObject(planData.diet) && DAYS.some((day) => Object.prototype.hasOwnProperty.call(planData.diet, day))) {
    return planData.diet as Record<string, T>;
  }
  return {};
}

function getWorkoutDay(planData: unknown, day: string): WorkoutDay {
  const allDays = getPlanDays<WorkoutDay>(planData);
  const value = allDays[day];
  if (!isObject(value)) {
    return { focus: 'Rest / Recovery', duration_minutes: 0, exercises: [] };
  }
  return {
    focus: typeof value.focus === 'string' ? value.focus : 'Training',
    duration_minutes: value.duration_minutes ?? value.duration ?? 0,
    exercises: Array.isArray(value.exercises) ? value.exercises : [],
  };
}

function getDietDay(planData: unknown, day: string): DietDay {
  const allDays = getPlanDays<DietDay>(planData);
  const value = allDays[day];
  if (!isObject(value)) {
    return { breakfast: [], lunch: [], dinner: [], snacks: [], daily_total_calories: 0, daily_total_protein_g: 0 };
  }
  return value;
}

function normalizeMeals(value: Meal | Meal[] | undefined): Meal[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is Meal => isObject(item));
  if (isObject(value)) return [value];
  return [];
}

function getMealName(meal: Meal): string {
  return meal.meal || meal.name || 'Meal';
}

function getMealCalories(meal: Meal): number {
  return toNumber(meal.calories);
}

function getMealProtein(meal: Meal): number {
  return toNumber(meal.protein_g ?? meal.protein);
}

function buildActivityMap(rows: any[]): ActivityMap {
  const map: ActivityMap = {};
  for (const row of rows) {
    if (typeof row?.day === 'string') {
      map[row.day] = Boolean(row.completed);
    }
  }
  return map;
}

// ============================================================
// Component
// ============================================================

export default function DashboardPage() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);

  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const [workoutActivity, setWorkoutActivity] = useState<ActivityMap>({});
  const [dietActivity, setDietActivity] = useState<ActivityMap>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);

  const [expandedWorkoutDay, setExpandedWorkoutDay] = useState<string | null>(null);
  const [expandedDietDay, setExpandedDietDay] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [formData, setFormData] = useState({
    weight_kg: '',
    workout_difficulty: 'Just Right' as WorkoutDifficulty,
    energy_rating: 3,
    user_notes: '',
  });

  // UI View Toggle
  const [viewMode, setViewMode] = useState<'today' | 'week'>('today');
  const [currentDayStr, setCurrentDayStr] = useState<string>('Monday');

  // Handle Hydration and Day finding
  useEffect(() => {
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    setCurrentDayStr(todayName);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut({ redirectUrl: '/login' });
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = '/login';
    }
  };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard-data', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load dashboard');

      const result = data as DashboardResponse;
      setDashboard(result);
      setWorkoutActivity(buildActivityMap(result.workoutActivity || []));
      setDietActivity(buildActivityMap(result.dietActivity || []));

      if (result.latestReview?.weight_kg != null) {
        setFormData((prev) => ({ ...prev, weight_kg: String(result.latestReview!.weight_kg) }));
      } else if (result.profile?.initial_weight_kg != null) {
        setFormData((prev) => ({ ...prev, weight_kg: String(result.profile!.initial_weight_kg) }));
      } else if (result.profile?.weight_kg != null) {
        setFormData((prev) => ({ ...prev, weight_kg: String(result.profile!.weight_kg) }));
      }
    } catch (err: any) {
      console.error('Dashboard error:', err);
      setError(err?.message || 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isUserLoaded) return;
    if (user) fetchDashboard();
    else setLoading(false);
  }, [isUserLoaded, user, fetchDashboard]);

  const generateFirstPlan = async () => {
    setGeneratingPlan(true);
    setGenerateError('');
    try {
      const response = await fetch('/api/genrate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to generate plan');
      await fetchDashboard();
    } catch (err: any) {
      console.error('Generate plan error:', err);
      setGenerateError(err?.message || 'Failed to generate your plan.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const currentWeek = dashboard?.workout?.week_number ?? dashboard?.diet?.week_number ?? null;

  const toggleActivity = async (type: 'workout' | 'diet', day: string) => {
    if (!dashboard?.profile || currentWeek == null) return;

    const key = `${type}-${day}`;
    const previousValue = type === 'workout' ? Boolean(workoutActivity[day]) : Boolean(dietActivity[day]);
    const nextValue = !previousValue;

    setActivityLoading(key);

    if (type === 'workout') {
      setWorkoutActivity((prev) => ({ ...prev, [day]: nextValue }));
    } else {
      setDietActivity((prev) => ({ ...prev, [day]: nextValue }));
    }

    try {
      const response = await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ type, day, week_number: currentWeek, completed: nextValue }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to save activity');
    } catch (err: any) {
      console.error('Activity error:', err);
      if (type === 'workout') {
        setWorkoutActivity((prev) => ({ ...prev, [day]: previousValue }));
      } else {
        setDietActivity((prev) => ({ ...prev, [day]: previousValue }));
      }
      alert(err?.message || 'Could not save activity.');
    } finally {
      setActivityLoading(null);
    }
  };

  const submitWeeklyReview = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmittingReview(true);
    setSubmitError('');

    try {
      await getToken({ skipCache: true });
      const weight = Number(formData.weight_kg);
      if (!Number.isFinite(weight) || weight <= 0) throw new Error('Please enter a valid weight.');

      const response = await fetch('/api/weekly-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          weight_kg: weight,
          workout_difficulty: formData.workout_difficulty,
          energy_rating: formData.energy_rating,
          user_notes: formData.user_notes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Weekly review failed');

      setModalOpen(false);
      setFormData((prev) => ({ ...prev, user_notes: '' }));
      await fetchDashboard();
    } catch (err: any) {
      console.error('Weekly review error:', err);
      setSubmitError(err?.message || 'Something went wrong.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const workoutDays = useMemo(() => {
    return DAYS.map((day) => ({
      day,
      data: getWorkoutDay(dashboard?.workout?.plan_data, day),
    }));
  }, [dashboard?.workout]);

  const dietDays = useMemo(() => {
    return DAYS.map((day) => ({
      day,
      data: getDietDay(dashboard?.diet?.plan_data, day),
    }));
  }, [dashboard?.diet]);

  // Derived Metrics for Dashboard
  const { totalWorkouts, completedWorkouts, completedDiet } = useMemo(() => {
    let tWorkouts = 0;
    let cWorkouts = 0;
    let cDiet = 0;

    workoutDays.forEach(wd => {
      const isRest = wd.data.duration_minutes === 0 || String(wd.data.focus).toLowerCase().includes('rest');
      if (!isRest) tWorkouts++;
    });

    Object.values(workoutActivity).forEach(val => { if (val) cWorkouts++; });
    Object.values(dietActivity).forEach(val => { if (val) cDiet++; });

    return { totalWorkouts: tWorkouts, completedWorkouts: cWorkouts, completedDiet: cDiet };
  }, [workoutDays, workoutActivity, dietActivity]);

  const todayWorkoutData = workoutDays.find(d => d.day === currentDayStr)?.data;
  const todayDietData = dietDays.find(d => d.day === currentDayStr)?.data;
  const isTodayRest = todayWorkoutData?.duration_minutes === 0 || String(todayWorkoutData?.focus).toLowerCase().includes('rest');
  const isTodayWorkoutCompleted = workoutActivity[currentDayStr] || false;
  const isTodayDietCompleted = dietActivity[currentDayStr] || false;


  // ==========================================================
  // Render: Loading
  // ==========================================================
  if (!isUserLoaded || loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          <p className="text-slate-400">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // ==========================================================
  // Render: Unauthenticated
  // ==========================================================
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-xl font-bold text-white">Sign in required</h1>
          <p className="mt-2 text-slate-400">Please sign in to access your dashboard.</p>
          <button onClick={() => window.location.href = '/login'} className="mt-6 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================
  // Render: API Error
  // ==========================================================
  if (error && !dashboard) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-red-900/50 bg-slate-900 p-8">
          <div className="flex items-center gap-3">
            <X className="h-6 w-6 text-red-400" />
            <h1 className="text-xl font-bold text-white">Dashboard Error</h1>
          </div>
          <p className="mt-4 text-slate-400">{error}</p>
          <button onClick={fetchDashboard} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
            <RefreshCw className="h-4 w-4" /> Try Again
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================
  // Render: State A - No Profile
  // ==========================================================
  if (dashboard && !dashboard.hasProfile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
        <header className="mx-auto max-w-5xl flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Welcome, {user.firstName || 'User'}</h1>
            <p className="mt-1 text-slate-400">Let's set up your FitAdapt profile.</p>
          </div>
          <button onClick={handleLogout} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            <LogOut className="mr-2 inline h-4 w-4" /> Logout
          </button>
        </header>
        <main className="mx-auto mt-10 max-w-2xl">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/20">
              <Target className="h-8 w-8 text-indigo-400" />
            </div>
            <h2 className="mt-6 text-2xl font-bold text-white">Complete Your Profile</h2>
            <p className="mx-auto mt-3 max-w-lg text-slate-400">Your profile is not configured yet. Complete onboarding so FitAdapt can generate a plan based on your goals.</p>
            <a href="/onboarding" className="mt-8 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-lg hover:bg-indigo-700">
              Complete Profile
            </a>
          </div>
        </main>
      </div>
    );
  }

  // ==========================================================
  // Render: State B - Has Profile, No Active Plan
  // ==========================================================
  const hasAnyPlan = Boolean(dashboard?.workout) || Boolean(dashboard?.diet);
  
  if (dashboard && dashboard.hasProfile && !hasAnyPlan) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10">
        <header className="mx-auto max-w-6xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Welcome, {user.firstName || 'User'}</h1>
            <p className="mt-1 text-slate-400">Your profile is ready.</p>
          </div>
          <button onClick={handleLogout} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
            <LogOut className="mr-2 inline h-4 w-4" /> Logout
          </button>
        </header>
        <main className="mx-auto mt-12 max-w-2xl">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center shadow-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10">
              <Sparkles className="h-8 w-8 text-emerald-400" />
            </div>
            <h2 className="mt-6 text-2xl font-bold text-white">No Active Plan Found</h2>
            <p className="mx-auto mt-3 max-w-lg text-slate-400">Your profile is complete, but you don't have an active workout or diet plan yet. Let AI build your first 7-day plan.</p>
            {generateError && <div className="mt-6 rounded-lg border border-red-900/50 bg-red-950/30 p-4 text-left text-sm text-red-300">{generateError}</div>}
            
            {generatingPlan ? (
              <div className="mt-8 flex flex-col items-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                <p className="font-medium text-emerald-300">AI Coach is crafting your 7-day plan...</p>
              </div>
            ) : (
              <button onClick={generateFirstPlan} className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-7 py-3 font-semibold text-white shadow-lg transition hover:bg-emerald-700">
                <Sparkles className="h-5 w-5" /> 🚀 Generate My First AI Plan
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  // ==========================================================
  // Render: State C - Active Plan
  // ==========================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 pt-8 pb-6 px-6 md:px-8">
        <div className="mx-auto max-w-5xl flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <p className="text-emerald-400 font-semibold mb-1 tracking-wide text-sm flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> 
              Week {currentWeek} • {currentDayStr}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Good morning, {user.firstName || 'User'}
            </h1>
          </div>
          <button onClick={handleLogout} className="self-start md:self-auto rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Logout">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6 md:px-8">
        
        {/* Weekly Progress Summary */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-indigo-500/10 p-2 rounded-lg">
                <Dumbbell className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="font-semibold text-slate-300 text-sm">Workouts</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {completedWorkouts} <span className="text-slate-500 text-base font-normal">/ {totalWorkouts}</span>
            </p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-emerald-500/10 p-2 rounded-lg">
                <Utensils className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="font-semibold text-slate-300 text-sm">Diet Days</h3>
            </div>
            <p className="text-2xl font-bold text-white">
              {completedDiet} <span className="text-slate-500 text-base font-normal">/ 7</span>
            </p>
          </div>
        </div>

        {/* View Toggles */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 mb-8 max-w-sm">
          <button 
            onClick={() => setViewMode('today')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${viewMode === 'today' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Today
          </button>
          <button 
            onClick={() => setViewMode('week')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${viewMode === 'week' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Full Week
          </button>
        </div>

        {viewMode === 'today' && (
          <div className="space-y-6">
            
            {/* TODAY'S WORKOUT */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Today's Workout</h2>
              
              {isTodayRest ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center py-12">
                  <div className="bg-indigo-500/10 p-4 rounded-full mb-4">
                    <Moon className="w-8 h-8 text-indigo-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-1">Rest Day</h3>
                  <p className="text-slate-400">Take it easy and let your body recover.</p>
                </div>
              ) : (
                <div className={`border rounded-2xl overflow-hidden transition-all ${isTodayWorkoutCompleted ? 'bg-indigo-950/20 border-indigo-500/30' : 'bg-slate-900 border-slate-800'}`}>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="text-2xl font-bold text-white">{todayWorkoutData?.focus || 'Training'}</h3>
                        <p className="text-slate-400 mt-1 flex items-center gap-2">
                          <Clock3 className="w-4 h-4" /> {todayWorkoutData?.duration_minutes} minutes
                          <span className="text-slate-600">•</span>
                          <ListChecks className="w-4 h-4" /> {todayWorkoutData?.exercises?.length || 0} exercises
                        </p>
                      </div>
                      {isTodayWorkoutCompleted && (
                        <span className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" /> Done
                        </span>
                      )}
                    </div>
                    
                    {/* Exercises Summary List */}
                    <div className="space-y-3 mt-6 mb-6">
                      {todayWorkoutData?.exercises?.map((ex, idx) => (
                        <div key={idx} className="bg-slate-950/50 rounded-lg p-4 border border-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-200">{ex.name || ex.exercise || `Exercise ${idx+1}`}</p>
                            {ex.notes && <p className="text-xs text-slate-500 mt-1">{ex.notes}</p>}
                          </div>
                          <div className="text-sm font-medium text-slate-400 whitespace-nowrap bg-slate-900 px-3 py-1.5 rounded-md self-start sm:self-auto border border-slate-800">
                            {ex.sets ?? '-'} sets × {ex.reps ?? '-'} reps
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      disabled={activityLoading === `workout-${currentDayStr}`}
                      onClick={() => toggleActivity('workout', currentDayStr)}
                      className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                        isTodayWorkoutCompleted 
                          ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-600/20'
                      }`}
                    >
                      {activityLoading === `workout-${currentDayStr}` ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                        isTodayWorkoutCompleted ? <><Check className="w-5 h-5" /> Completed</> : "Mark Workout Complete"
                      )}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* TODAY'S DIET */}
            <section className="mt-10">
              <h2 className="text-xl font-bold text-white mb-4">Today's Diet</h2>
              
              <div className={`border rounded-2xl overflow-hidden transition-all ${isTodayDietCompleted ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-900 border-slate-800'}`}>
                <div className="p-6">
                  
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h3 className="text-xl font-bold text-white">Daily Nutrition</h3>
                      <div className="flex gap-4 mt-2">
                        <span className="text-orange-400 text-sm font-medium flex items-center gap-1"><Flame className="w-4 h-4"/> {todayDietData?.daily_total_calories ?? todayDietData?.total_calories ?? 0} kcal</span>
                        <span className="text-emerald-400 text-sm font-medium flex items-center gap-1"><Zap className="w-4 h-4"/> {todayDietData?.daily_total_protein_g ?? todayDietData?.total_protein_g ?? 0}g Pro</span>
                      </div>
                    </div>
                    {isTodayDietCompleted && (
                      <span className="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> Done
                      </span>
                    )}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 mb-6">
                    {[
                      { title: 'Breakfast', meals: normalizeMeals(todayDietData?.breakfast) },
                      { title: 'Lunch', meals: normalizeMeals(todayDietData?.lunch) },
                      { title: 'Dinner', meals: normalizeMeals(todayDietData?.dinner) },
                      { title: 'Snacks', meals: normalizeMeals(todayDietData?.snacks) }
                    ].map(({title, meals}) => (
                      <div key={title} className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                        <p className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2">{title}</p>
                        {meals.length > 0 ? (
                          meals.map((meal, idx) => (
                            <div key={idx} className="mb-2 last:mb-0">
                              <p className="font-medium text-slate-200">{getMealName(meal)}</p>
                              <p className="text-xs text-slate-400">{getMealCalories(meal)} kcal • {getMealProtein(meal)}g pro</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-600">No items specified</p>
                        )}
                      </div>
                    ))}
                  </div>

                  <button
                    disabled={activityLoading === `diet-${currentDayStr}`}
                    onClick={() => toggleActivity('diet', currentDayStr)}
                    className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${
                      isTodayDietCompleted 
                        ? 'bg-slate-800 text-slate-400 hover:bg-slate-700' 
                        : 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                    }`}
                  >
                    {activityLoading === `diet-${currentDayStr}` ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                      isTodayDietCompleted ? <><Check className="w-5 h-5" /> Completed</> : "Mark Diet Complete"
                    )}
                  </button>
                </div>
              </div>
            </section>

          </div>
        )}

        {viewMode === 'week' && (
          <div className="space-y-12">
            
            {/* Coach AI Insight */}
            {dashboard?.latestReview?.ai_analysis && (
              <section className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-6 shadow-lg">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Sparkles className="h-6 w-6 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-emerald-400">
                      Coach AI · Week {dashboard.latestReview.week_number} Review
                    </p>
                    <p className="mt-2 leading-7 text-slate-200">
                      {dashboard.latestReview.ai_analysis}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Weekly Workout */}
            <section>
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10">
                  <Dumbbell className="h-5 w-5 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Full Week Workout</h2>
                </div>
              </div>
              <div className="grid gap-4">
                {workoutDays.map(({ day, data }) => {
                  const expanded = expandedWorkoutDay === day;
                  const completed = Boolean(workoutActivity[day]);
                  const loadingActivity = activityLoading === `workout-${day}`;
                  
                  return (
                    <div key={day} className={`overflow-hidden rounded-2xl border bg-slate-900 transition ${completed ? 'border-emerald-500/30' : 'border-slate-800'}`}>
                      <button type="button" onClick={() => setExpandedWorkoutDay(expanded ? null : day)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-bold text-white">{day}</h3>
                            {completed && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">Completed</span>}
                          </div>
                          <p className="mt-1 text-sm text-indigo-300">{data.focus || 'Training'}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="hidden items-center gap-1.5 text-sm text-slate-500 sm:flex"><Clock3 className="h-4 w-4" />{displayNumber(data.duration_minutes)} min</span>
                          {expanded ? <ChevronUp className="h-5 w-5 text-slate-500" /> : <ChevronDown className="h-5 w-5 text-slate-500" />}
                        </div>
                      </button>

                      {expanded && (
                        <div className="border-t border-slate-800 p-5">
                          <div className="mb-4 flex items-center justify-between">
                            <span className="flex items-center gap-2 text-sm text-slate-400"><Clock3 className="h-4 w-4" />{displayNumber(data.duration_minutes)} minutes</span>
                            <button type="button" disabled={loadingActivity} onClick={() => toggleActivity('workout', day)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${completed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-600 text-white'} disabled:opacity-60`}>
                              {loadingActivity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              {completed ? 'Completed' : 'Mark Complete'}
                            </button>
                          </div>
                          {data.exercises && data.exercises.length > 0 ? (
                            <div className="space-y-3">
                              {data.exercises.map((exercise, index) => (
                                <div key={`${day}-${index}`} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                    <div>
                                      <h4 className="font-semibold text-white">{exercise.name || exercise.exercise || `Exercise ${index + 1}`}</h4>
                                      {exercise.notes && <p className="mt-1 text-sm leading-6 text-slate-500">{exercise.notes}</p>}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                                      <div className="rounded-lg bg-slate-900 px-3 py-2"><p className="text-slate-500">Sets</p><p className="mt-1 font-bold text-white">{exercise.sets ?? '—'}</p></div>
                                      <div className="rounded-lg bg-slate-900 px-3 py-2"><p className="text-slate-500">Reps</p><p className="mt-1 font-bold text-white">{exercise.reps ?? '—'}</p></div>
                                      <div className="rounded-lg bg-slate-900 px-3 py-2"><p className="text-slate-500">Rest</p><p className="mt-1 font-bold text-white">{exercise.rest_seconds ?? exercise.rest ?? '—'}s</p></div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-5 text-center text-sm text-slate-500">No exercises scheduled.</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Weekly Diet */}
            <section>
              <div className="mb-5 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Utensils className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Full Week Diet</h2>
                </div>
              </div>
              <div className="grid gap-4">
                {dietDays.map(({ day, data }) => {
                  const expanded = expandedDietDay === day;
                  const completed = Boolean(dietActivity[day]);
                  const loadingActivity = activityLoading === `diet-${day}`;
                  const totalCalories = data.daily_total_calories ?? data.total_calories ?? 0;
                  const totalProtein = data.daily_total_protein_g ?? data.total_protein_g ?? 0;

                  return (
                    <div key={day} className={`overflow-hidden rounded-2xl border bg-slate-900 transition ${completed ? 'border-emerald-500/30' : 'border-slate-800'}`}>
                      <button type="button" onClick={() => setExpandedDietDay(expanded ? null : day)} className="flex w-full items-center justify-between gap-4 p-5 text-left">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-bold text-white">{day}</h3>
                            {completed && <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-400">Completed</span>}
                          </div>
                          <div className="mt-2 flex gap-3 text-xs">
                            <span className="inline-flex items-center gap-1.5 text-orange-400"><Flame className="h-4 w-4" />{displayNumber(totalCalories)} kcal</span>
                            <span className="inline-flex items-center gap-1.5 text-emerald-400"><Zap className="h-4 w-4" />{displayNumber(totalProtein)}g pro</span>
                          </div>
                        </div>
                        {expanded ? <ChevronUp className="h-5 w-5 shrink-0 text-slate-500" /> : <ChevronDown className="h-5 w-5 shrink-0 text-slate-500" />}
                      </button>

                      {expanded && (
                        <div className="border-t border-slate-800 p-5">
                          <div className="mb-5 flex justify-end">
                            <button type="button" disabled={loadingActivity} onClick={() => toggleActivity('diet', day)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${completed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-600 text-white'} disabled:opacity-60`}>
                              {loadingActivity ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              {completed ? 'Completed' : 'Mark Complete'}
                            </button>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2">
                            {[
                              { title: 'Breakfast', meals: normalizeMeals(data.breakfast) },
                              { title: 'Lunch', meals: normalizeMeals(data.lunch) },
                              { title: 'Dinner', meals: normalizeMeals(data.dinner) },
                              { title: 'Snacks', meals: normalizeMeals(data.snacks) },
                            ].map(({ title, meals }) => (
                              <div key={title} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                                <h4 className="font-semibold text-white">{title}</h4>
                                {meals.length > 0 ? (
                                  <div className="mt-3 space-y-3">
                                    {meals.map((meal, index) => (
                                      <div key={`${title}-${index}`} className="rounded-lg bg-slate-900 p-3">
                                        <p className="text-sm font-medium text-slate-200">{getMealName(meal)}</p>
                                        <div className="mt-2 flex gap-4 text-xs">
                                          <span className="text-orange-400">{getMealCalories(meal)} kcal</span>
                                          <span className="text-emerald-400">{getMealProtein(meal)} g pro</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-3 text-sm text-slate-500">No items listed.</p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* ==================================================
            Weekly Review Button (Always visible at bottom)
        ================================================== */}
        <section className="mt-12 pb-12">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-indigo-400" />
            <h2 className="mt-3 text-xl font-bold text-white">Ready to review this week?</h2>
            <p className="mt-2 text-sm text-slate-400">Your feedback helps the AI Coach adjust your next week.</p>
            <button
              type="button"
              onClick={() => { setSubmitError(''); setModalOpen(true); }}
              className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700"
            >
              🏁 Complete Week {currentWeek ?? ''} & Review
            </button>
          </div>
        </section>

      </main>

      {/* ====================================================
          Weekly Review Modal (Unchanged)
      ==================================================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && !submittingReview) setModalOpen(false); }}>
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-6">
              <div>
                <h2 className="text-xl font-bold text-white">Weekly Check-In</h2>
                <p className="mt-1 text-sm text-slate-500">Week {currentWeek} review</p>
              </div>
              <button type="button" disabled={submittingReview} onClick={() => setModalOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={submitWeeklyReview} className="space-y-5 p-6">
              <div>
                <label className="text-sm font-medium text-slate-300">Current Weight (kg)</label>
                <input type="number" step="0.1" min="0.1" required value={formData.weight_kg} onChange={(e) => setFormData((prev) => ({ ...prev, weight_kg: e.target.value }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500" placeholder="e.g. 70.5" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Workout Difficulty</label>
                <select value={formData.workout_difficulty} onChange={(e) => setFormData((prev) => ({ ...prev, workout_difficulty: e.target.value as WorkoutDifficulty }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500">
                  <option value="Too Easy">Too Easy</option>
                  <option value="Just Right">Just Right</option>
                  <option value="Too Hard">Too Hard</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Energy Level</label>
                <div className="mt-2 flex gap-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <button key={num} type="button" onClick={() => setFormData((prev) => ({ ...prev, energy_rating: num }))} className={`h-11 w-11 rounded-full text-sm font-bold transition ${formData.energy_rating === num ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 ring-offset-2 ring-offset-slate-900' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                      {num}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Feedback / Notes</label>
                <textarea rows={4} value={formData.user_notes} onChange={(e) => setFormData((prev) => ({ ...prev, user_notes: e.target.value }))} className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500" placeholder="How did the week feel? What should the AI Coach know?" />
              </div>
              {submitError && <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{submitError}</div>}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" disabled={submittingReview} onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={submittingReview} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {submittingReview ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</> : <><Sparkles className="h-4 w-4" /> Submit Review</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
