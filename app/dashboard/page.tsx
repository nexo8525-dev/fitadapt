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
  ListChecks,
  Play,
  TrendingUp
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
type DietStatus = 'Followed' | 'Swapped' | 'Skipped';

interface ActivityMap {
  [day: string]: {
    completed: boolean;
    tracking_data?: any;
  };
}

// ============================================================
// Constants & Helpers
// ============================================================
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function isObject(value: unknown): value is Record<string, any> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function toNumber(value: unknown, fallback = 0): number { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function displayNumber(value: unknown, fallback = '0'): string { const n = Number(value); if (!Number.isFinite(n)) return fallback; return Number.isInteger(n) ? String(n) : n.toFixed(1); }

function getPlanDays<T>(planData: unknown): Record<string, T> {
  if (!isObject(planData)) return {};
  const hasDays = DAYS.some((day) => Object.prototype.hasOwnProperty.call(planData, day));
  if (hasDays) return planData as Record<string, T>;
  if (isObject(planData.workout) && DAYS.some((day) => Object.prototype.hasOwnProperty.call(planData.workout, day))) return planData.workout as Record<string, T>;
  if (isObject(planData.diet) && DAYS.some((day) => Object.prototype.hasOwnProperty.call(planData.diet, day))) return planData.diet as Record<string, T>;
  return {};
}

function getWorkoutDay(planData: unknown, day: string): any {
  const allDays = getPlanDays<any>(planData);
  const value = allDays[day];
  if (!isObject(value)) return { focus: 'Rest / Recovery', duration_minutes: 0, exercises: [] };
  return { focus: typeof value.focus === 'string' ? value.focus : 'Training', duration_minutes: value.duration_minutes ?? value.duration ?? 0, exercises: Array.isArray(value.exercises) ? value.exercises : [] };
}

function getDietDay(planData: unknown, day: string): any {
  const allDays = getPlanDays<any>(planData);
  const value = allDays[day];
  if (!isObject(value)) return { breakfast: [], lunch: [], dinner: [], snacks: [], daily_total_calories: 0, daily_total_protein_g: 0 };
  return value;
}

function normalizeMeals(value: any | any[] | undefined): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter((item): item is any => isObject(item));
  if (isObject(value)) return [value];
  return [];
}

function getMealName(meal: any): string { return meal.meal || meal.name || 'Meal'; }
function getMealCalories(meal: any): number { return toNumber(meal.calories); }
function getMealProtein(meal: any): number { return toNumber(meal.protein_g ?? meal.protein); }

function buildActivityMap(rows: any[]): ActivityMap {
  const map: ActivityMap = {};
  for (const row of rows) {
    if (typeof row?.day === 'string') {
      map[row.day] = {
        completed: Boolean(row.completed),
        tracking_data: row.tracking_data || {}
      };
    }
  }
  return map;
}

// ============================================================
// Main Component
// ============================================================
export default function DashboardPage() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<any | null>(null);

  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [generateError, setGenerateError] = useState('');

  const [workoutActivity, setWorkoutActivity] = useState<ActivityMap>({});
  const [dietActivity, setDietActivity] = useState<ActivityMap>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'today' | 'week'>('today');
  const [currentDayStr, setCurrentDayStr] = useState<string>('Monday');

  const [expandedWorkoutDay, setExpandedWorkoutDay] = useState<string | null>(null);
  const [expandedDietDay, setExpandedDietDay] = useState<string | null>(null);

  // Modals Data
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [activeWorkoutData, setActiveWorkoutData] = useState<any>({});
  
  const [dietModalOpen, setDietModalOpen] = useState(false);
  const [activeDietMeal, setActiveDietMeal] = useState<{title: string, meal: any, index: number} | null>(null);
  const [activeDietForm, setActiveDietForm] = useState({ status: 'Followed' as DietStatus, reason: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [formData, setFormData] = useState({
    weight_kg: '',
    workout_difficulty: 'Just Right' as WorkoutDifficulty,
    energy_rating: 3,
    user_notes: '',
  });

  useEffect(() => {
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    setCurrentDayStr(todayName);
  }, []);

  const handleLogout = async () => {
    try { await signOut({ redirectUrl: '/login' }); } 
    catch (error) { window.location.href = '/login'; }
  };

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/dashboard-data', { method: 'GET', cache: 'no-store', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load dashboard');

      setDashboard(data);
      setWorkoutActivity(buildActivityMap(data.workoutActivity || []));
      setDietActivity(buildActivityMap(data.dietActivity || []));

      if (data.latestReview?.weight_kg != null) setFormData(prev => ({ ...prev, weight_kg: String(data.latestReview!.weight_kg) }));
      else if (data.profile?.initial_weight_kg != null) setFormData(prev => ({ ...prev, weight_kg: String(data.profile!.initial_weight_kg) }));
      else if (data.profile?.weight_kg != null) setFormData(prev => ({ ...prev, weight_kg: String(data.profile!.weight_kg) }));
    } catch (err: any) {
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
      const response = await fetch('/api/genrate-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to generate plan');
      await fetchDashboard();
    } catch (err: any) {
      setGenerateError(err?.message || 'Failed to generate your plan.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const currentWeek = dashboard?.workout?.week_number ?? dashboard?.diet?.week_number ?? null;

  const workoutDays = useMemo(() => DAYS.map((day) => ({ day, data: getWorkoutDay(dashboard?.workout?.plan_data, day) })), [dashboard?.workout]);
  const dietDays = useMemo(() => DAYS.map((day) => ({ day, data: getDietDay(dashboard?.diet?.plan_data, day) })), [dashboard?.diet]);

  const { totalWorkouts, completedWorkouts, completedDiet } = useMemo(() => {
    let tW = 0, cW = 0, cD = 0;
    workoutDays.forEach(wd => { if (wd.data.duration_minutes !== 0 && !String(wd.data.focus).toLowerCase().includes('rest')) tW++; });
    Object.values(workoutActivity).forEach(val => { if (val.completed) cW++; });
    Object.values(dietActivity).forEach(val => { if (val.completed) cD++; });
    return { totalWorkouts: tW, completedWorkouts: cW, completedDiet: cD };
  }, [workoutDays, workoutActivity, dietActivity]);

  const todayWorkoutData = workoutDays.find(d => d.day === currentDayStr)?.data;
  const todayDietData = dietDays.find(d => d.day === currentDayStr)?.data;
  
  const isTodayRest = todayWorkoutData?.duration_minutes === 0 || String(todayWorkoutData?.focus).toLowerCase().includes('rest');
  const isTodayWorkoutCompleted = workoutActivity[currentDayStr]?.completed || false;
  const isTodayDietCompleted = dietActivity[currentDayStr]?.completed || false;

  // -------------------------
  // Tracker Functions
  // -------------------------
  const startWorkout = () => {
    const initialTracking: any = { exercises: [], feedback: { difficulty: 'Just Right', notes: '' } };
    todayWorkoutData?.exercises?.forEach((ex: any) => {
      initialTracking.exercises.push({
        name: ex.name || ex.exercise,
        prescribed_sets: ex.sets,
        prescribed_reps: ex.reps,
        actual_sets: ex.sets || '',
        actual_reps: ex.reps || '',
      });
    });
    setActiveWorkoutData(initialTracking);
    setWorkoutModalOpen(true);
  };

  const updateExerciseTracking = (index: number, field: string, value: string) => {
    const updated = { ...activeWorkoutData };
    updated.exercises[index][field] = value;
    setActiveWorkoutData(updated);
  };

  const finishWorkout = async () => {
    const day = currentDayStr;
    setActivityLoading(`workout-${day}`);
    setWorkoutActivity(prev => ({ ...prev, [day]: { completed: true, tracking_data: activeWorkoutData } }));
    setWorkoutModalOpen(false);

    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'workout', day, week_number: currentWeek, completed: true, tracking_data: activeWorkoutData }),
      });
    } catch (err) {
      alert('Failed to save workout data.');
      fetchDashboard();
    } finally {
      setActivityLoading(null);
    }
  };

  const openDietMealTracker = (title: string, meal: any, index: number) => {
    setActiveDietMeal({ title, meal, index });
    const existing = dietActivity[currentDayStr]?.tracking_data?.[title]?.[index];
    setActiveDietForm(existing ? { status: existing.status, reason: existing.reason } : { status: 'Followed', reason: '' });
    setDietModalOpen(true);
  };

  const saveDietMeal = async () => {
    if (!activeDietMeal) return;
    const day = currentDayStr;
    setActivityLoading(`diet-${day}`);

    const currentTrackingData = dietActivity[day]?.tracking_data || {};
    const updatedCategory = [...(currentTrackingData[activeDietMeal.title] || [])];
    
    while (updatedCategory.length <= activeDietMeal.index) { updatedCategory.push(null); }
    updatedCategory[activeDietMeal.index] = { prescribed_meal: getMealName(activeDietMeal.meal), status: activeDietForm.status, reason: activeDietForm.reason };

    const newTrackingData = { ...currentTrackingData, [activeDietMeal.title]: updatedCategory };
    setDietActivity(prev => ({ ...prev, [day]: { completed: true, tracking_data: newTrackingData } }));
    setDietModalOpen(false);

    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'diet', day, week_number: currentWeek, completed: true, tracking_data: newTrackingData }),
      });
    } catch (err) {
      alert('Failed to save diet data.');
      fetchDashboard();
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
      setSubmitError(err?.message || 'Something went wrong.');
    } finally {
      setSubmittingReview(false);
    }
  };

  // -------------------------
  // Render Loading / UnAuth
  // -------------------------
  if (!isUserLoaded || loading) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8" /></div>;
  if (!user) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><button onClick={() => window.location.href = '/login'} className="bg-indigo-600 px-5 py-3 rounded-lg text-white font-bold">Sign In Required</button></div>;
  if (error && !dashboard) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><p className="text-red-400">{error}</p></div>;

  // -------------------------
  // Render No Profile / No Plan
  // -------------------------
  if (dashboard && !dashboard.hasProfile) return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><a href="/onboarding" className="bg-indigo-600 px-5 py-3 rounded-lg text-white font-bold">Complete Profile</a></div>;
  if (dashboard && dashboard.hasProfile && !dashboard.workout && !dashboard.diet) {
    return (
      <div className="min-h-screen bg-slate-950 p-6 flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold text-white mb-4">No Active Plan</h2>
        <button onClick={generateFirstPlan} className="bg-emerald-600 px-7 py-3 rounded-xl text-white font-bold flex items-center gap-2">
          {generatingPlan ? <Loader2 className="animate-spin w-5 h-5"/> : <><Sparkles className="w-5 h-5"/> Generate My First AI Plan</>}
        </button>
      </div>
    );
  }

  // -------------------------
  // Render Active Dashboard
  // -------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      
      {/* HEADER */}
      <header className="border-b border-slate-800 bg-slate-950/90 pt-8 pb-6 px-6 md:px-8">
        <div className="mx-auto max-w-5xl flex items-start md:items-end justify-between gap-4">
          <div>
            <p className="text-emerald-400 font-semibold mb-1 tracking-wide text-sm flex items-center gap-2">
              <CalendarDays className="w-4 h-4" /> 
              Week {currentWeek} • {currentDayStr}
            </p>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">
              Good morning, {user?.firstName || 'User'}
            </h1>
          </div>
          
          <button 
            onClick={handleLogout} 
            className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 p-2.5 md:px-4 md:py-2.5 text-slate-400 hover:bg-red-950/30 hover:text-red-400 hover:border-red-900/50 transition-all" 
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden md:inline text-sm font-semibold">Logout</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6 md:px-8">
        
        {/* Weekly Progress */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-indigo-500/10 p-2 rounded-lg"><Dumbbell className="w-5 h-5 text-indigo-400" /></div>
              <h3 className="font-semibold text-slate-300 text-sm">Workouts</h3>
            </div>
            <p className="text-2xl font-bold text-white">{completedWorkouts} <span className="text-slate-500 text-base font-normal">/ {totalWorkouts}</span></p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-emerald-500/10 p-2 rounded-lg"><Utensils className="w-5 h-5 text-emerald-400" /></div>
              <h3 className="font-semibold text-slate-300 text-sm">Diet Days</h3>
            </div>
            <p className="text-2xl font-bold text-white">{completedDiet} <span className="text-slate-500 text-base font-normal">/ 7</span></p>
          </div>
        </div>

        {/* View Toggles & History Navigation (Feature 4 Update) */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 w-full md:max-w-sm">
            <button onClick={() => setViewMode('today')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${viewMode === 'today' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Today</button>
            <button onClick={() => setViewMode('week')} className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${viewMode === 'week' ? 'bg-slate-800 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>Full Week</button>
          </div>
          
          <button 
            onClick={() => window.location.href = '/progress'} 
            className="w-full md:w-auto flex items-center justify-center gap-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
          >
            <TrendingUp className="w-4 h-4" /> View Progress & History
          </button>
        </div>

        {/* TODAY VIEW */}
        {viewMode === 'today' && (
          <div className="space-y-8">
            
            {/* Workout Card */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Today's Workout</h2>
              {isTodayRest ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col items-center text-center py-12">
                  <div className="bg-indigo-500/10 p-4 rounded-full mb-4"><Moon className="w-8 h-8 text-indigo-400" /></div>
                  <h3 className="text-xl font-bold text-white mb-1">Rest Day</h3>
                  <p className="text-slate-400">Take it easy and recover.</p>
                </div>
              ) : (
                <div className={`border rounded-2xl overflow-hidden ${isTodayWorkoutCompleted ? 'bg-indigo-950/20 border-indigo-500/30' : 'bg-slate-900 border-slate-800'}`}>
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-white">{todayWorkoutData?.focus || 'Training'}</h3>
                        <p className="text-slate-400 mt-1 flex items-center gap-2">
                          <Clock3 className="w-4 h-4" /> {todayWorkoutData?.duration_minutes} mins
                          <span className="text-slate-600">•</span>
                          <ListChecks className="w-4 h-4" /> {todayWorkoutData?.exercises?.length || 0} exercises
                        </p>
                      </div>
                      {isTodayWorkoutCompleted && <span className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Completed</span>}
                    </div>

                    <button
                      disabled={activityLoading === `workout-${currentDayStr}`}
                      onClick={startWorkout}
                      className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all ${isTodayWorkoutCompleted ? 'bg-slate-800 text-slate-300 hover:bg-slate-700' : 'bg-indigo-600 text-white shadow-lg hover:bg-indigo-500 shadow-indigo-600/20'}`}
                    >
                      {activityLoading === `workout-${currentDayStr}` ? <Loader2 className="animate-spin" /> : (isTodayWorkoutCompleted ? 'Review Activity' : <><Play className="w-5 h-5"/> Start Workout</>)}
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Diet Card */}
            <section>
              <h2 className="text-xl font-bold text-white mb-4">Today's Diet</h2>
              <div className={`border rounded-2xl p-6 transition-all ${isTodayDietCompleted ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-900 border-slate-800'}`}>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white">Daily Nutrition</h3>
                    <div className="flex gap-4 mt-2">
                      <span className="text-orange-400 text-sm font-medium"><Flame className="w-4 h-4 inline mr-1"/> {todayDietData?.daily_total_calories ?? todayDietData?.total_calories ?? 0} kcal</span>
                      <span className="text-emerald-400 text-sm font-medium"><Zap className="w-4 h-4 inline mr-1"/> {todayDietData?.daily_total_protein_g ?? todayDietData?.total_protein_g ?? 0}g Pro</span>
                    </div>
                  </div>
                  {isTodayDietCompleted && <span className="bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> Done</span>}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { title: 'Breakfast', meals: normalizeMeals(todayDietData?.breakfast) },
                    { title: 'Lunch', meals: normalizeMeals(todayDietData?.lunch) },
                    { title: 'Dinner', meals: normalizeMeals(todayDietData?.dinner) },
                    { title: 'Snacks', meals: normalizeMeals(todayDietData?.snacks) }
                  ].map(({title, meals}) => (
                    <div key={title} className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                      <p className="text-xs font-bold uppercase text-slate-500 mb-3">{title}</p>
                      {meals.length > 0 ? meals.map((meal, idx) => {
                        const tracking = dietActivity[currentDayStr]?.tracking_data?.[title]?.[idx];
                        return (
                          <div key={idx} onClick={() => openDietMealTracker(title, meal, idx)} className="mb-3 cursor-pointer hover:bg-slate-800 p-2 -mx-2 rounded-lg border border-transparent hover:border-slate-700 flex justify-between items-center transition-colors">
                            <div>
                              <p className="font-medium text-slate-200">{getMealName(meal)}</p>
                              <p className="text-xs text-slate-400">{getMealCalories(meal)} kcal</p>
                            </div>
                            {tracking && (
                              <span className={`text-[10px] px-2 py-1 rounded-full uppercase font-bold tracking-wider ${tracking.status === 'Followed' ? 'bg-emerald-500/20 text-emerald-400' : tracking.status === 'Swapped' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>
                                {tracking.status}
                              </span>
                            )}
                          </div>
                        )
                      }) : <p className="text-sm text-slate-600">No items</p>}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* WEEKLY VIEW */}
        {viewMode === 'week' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white mb-2">Look Ahead</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
              <CalendarDays className="w-12 h-12 mx-auto mb-4 text-slate-500 opacity-50" />
              <p className="text-lg font-medium text-slate-300 mb-2">Weekly Overview</p>
              <p className="max-w-sm mx-auto">Switch to "Today" to log your daily tasks, or visit Progress & History to see past performance.</p>
            </div>
          </div>
        )}

        {/* Weekly Check-in CTA */}
        <section className="mt-12">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-950/20 p-6 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-indigo-400" />
            <h2 className="mt-3 text-xl font-bold text-white">Ready to review this week?</h2>
            <p className="mt-2 text-sm text-slate-400">Your feedback helps the AI Coach adjust your next week.</p>
            <button onClick={() => { setSubmitError(''); setModalOpen(true); }} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-7 py-3 font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all">
              🏁 Complete Week {currentWeek ?? ''}
            </button>
          </div>
        </section>

      </main>

      {/* 🔴 MODALS */}
      
      {/* Workout Tracking Modal */}
      {workoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-4 md:p-10 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950">
              <h2 className="text-xl font-bold text-white flex items-center gap-2"><Dumbbell className="text-indigo-400"/> Workout Execution</h2>
              <button onClick={() => setWorkoutModalOpen(false)} className="text-slate-500 hover:text-white"><X /></button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
              {activeWorkoutData.exercises?.map((ex: any, idx: number) => (
                <div key={idx} className="bg-slate-950 rounded-xl p-5 border border-slate-800">
                  <div className="mb-4">
                    <h4 className="text-lg font-bold text-white">{ex.name}</h4>
                    <p className="text-sm text-slate-400">Prescribed: {ex.prescribed_sets} sets × {ex.prescribed_reps} reps</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Actual Sets</label>
                      <input type="number" value={ex.actual_sets} onChange={(e) => updateExerciseTracking(idx, 'actual_sets', e.target.value)} className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Actual Reps</label>
                      <input type="text" value={ex.actual_reps} onChange={(e) => updateExerciseTracking(idx, 'actual_reps', e.target.value)} className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white" placeholder="e.g. 10,10,8" />
                    </div>
                  </div>
                </div>
              ))}
              
              <div className="bg-indigo-950/20 rounded-xl p-5 border border-indigo-500/20 mt-6">
                <h4 className="text-sm font-bold text-indigo-300 uppercase tracking-wider mb-4">Overall Feedback</h4>
                <select value={activeWorkoutData.feedback?.difficulty} onChange={(e) => setActiveWorkoutData({...activeWorkoutData, feedback: {...activeWorkoutData.feedback, difficulty: e.target.value}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white mb-4 outline-none focus:border-indigo-500">
                  <option>Easy</option>
                  <option>Just Right</option>
                  <option>Hard</option>
                </select>
                <textarea placeholder="Any notes on this workout?" value={activeWorkoutData.feedback?.notes} onChange={(e) => setActiveWorkoutData({...activeWorkoutData, feedback: {...activeWorkoutData.feedback, notes: e.target.value}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:border-indigo-500" rows={2}></textarea>
              </div>
            </div>

            <div className="p-5 border-t border-slate-800 bg-slate-950">
              <button onClick={finishWorkout} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl transition-colors">Save & Complete Workout</button>
            </div>
          </div>
        </div>
      )}

      {/* Diet Tracking Modal */}
      {dietModalOpen && activeDietMeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Utensils className="w-5 h-5 text-emerald-400"/> {activeDietMeal.title} Log</h2>
              <button onClick={() => setDietModalOpen(false)} className="text-slate-500 hover:text-white"><X /></button>
            </div>
            <div className="p-6">
              <div className="mb-6 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-sm text-slate-400">Prescribed Meal:</p>
                <p className="text-lg font-semibold text-white mt-1">{getMealName(activeDietMeal.meal)}</p>
              </div>

              <label className="text-sm font-bold text-slate-300 mb-3 block">Did you follow this?</label>
              <div className="grid grid-cols-3 gap-2 mb-6">
                {['Followed', 'Swapped', 'Skipped'].map((status) => (
                  <button key={status} onClick={() => setActiveDietForm({...activeDietForm, status: status as DietStatus})} className={`py-2 rounded-lg text-sm font-bold border transition-colors ${activeDietForm.status === status ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'}`}>
                    {status}
                  </button>
                ))}
              </div>

              {activeDietForm.status !== 'Followed' && (
                <div className="mb-4">
                  <label className="text-sm font-bold text-slate-300 mb-2 block">Reason / What did you eat?</label>
                  <textarea value={activeDietForm.reason} onChange={(e) => setActiveDietForm({...activeDietForm, reason: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500" rows={3} placeholder={activeDietForm.status === 'Swapped' ? "e.g., Ate outside, had a sandwich instead." : "e.g., Wasn't hungry."}></textarea>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-800 bg-slate-950">
              <button onClick={saveDietMeal} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3.5 rounded-xl transition-colors">Save Diet Log</button>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Feedback Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && !submittingReview) setModalOpen(false); }}>
          <div className="my-8 w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 p-6 bg-slate-950">
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
                <input type="number" step="0.1" min="0.1" required value={formData.weight_kg} onChange={(e) => setFormData((prev) => ({ ...prev, weight_kg: e.target.value }))} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500" />
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
                <label className="text-sm font-medium text-slate-300">Feedback / Notes</label>
                <textarea rows={4} value={formData.user_notes} onChange={(e) => setFormData((prev) => ({ ...prev, user_notes: e.target.value }))} className="mt-2 w-full resize-none rounded-lg border border-slate-700 bg-slate-800 px-4 py-3 text-white outline-none focus:border-indigo-500" />
              </div>
              {submitError && <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{submitError}</div>}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800 mt-2">
                <button type="button" disabled={submittingReview} onClick={() => setModalOpen(false)} className="rounded-lg border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-800">Cancel</button>
                <button type="submit" disabled={submittingReview} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
                  {submittingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Submit Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
