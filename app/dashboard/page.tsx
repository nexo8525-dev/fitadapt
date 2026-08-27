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
  MessageSquare
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

// [Omitted standard interfaces for brevity - KEEP YOUR EXISTING INTERFACES HERE]
// Profile, WorkoutPlan, DietPlan, WeeklyCheckin, DashboardResponse, Exercise, WorkoutDay, Meal, DietDay

interface ActivityMap {
  [day: string]: {
    completed: boolean;
    tracking_data?: any;
  };
}

// ============================================================
// Constants & Helpers (Keep existing ones)
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
// Component
// ============================================================

export default function DashboardPage() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dashboard, setDashboard] = useState<any | null>(null);

  const [workoutActivity, setWorkoutActivity] = useState<ActivityMap>({});
  const [dietActivity, setDietActivity] = useState<ActivityMap>({});
  const [activityLoading, setActivityLoading] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'today' | 'week'>('today');
  const [currentDayStr, setCurrentDayStr] = useState<string>('Monday');

  // Tracking Modals State
  const [workoutModalOpen, setWorkoutModalOpen] = useState(false);
  const [activeWorkoutData, setActiveWorkoutData] = useState<any>({});
  
  const [dietModalOpen, setDietModalOpen] = useState(false);
  const [activeDietMeal, setActiveDietMeal] = useState<{title: string, meal: any, index: number} | null>(null);
  const [activeDietForm, setActiveDietForm] = useState({ status: 'Followed' as DietStatus, reason: '' });

  // Weekly review form
  const [modalOpen, setModalOpen] = useState(false);
  
  useEffect(() => {
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
    setCurrentDayStr(todayName);
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/dashboard-data', { method: 'GET', cache: 'no-store', credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Failed to load dashboard');

      setDashboard(data);
      setWorkoutActivity(buildActivityMap(data.workoutActivity || []));
      setDietActivity(buildActivityMap(data.dietActivity || []));
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

  const currentWeek = dashboard?.workout?.week_number ?? dashboard?.diet?.week_number ?? null;

  const workoutDays = useMemo(() => DAYS.map((day) => ({ day, data: getWorkoutDay(dashboard?.workout?.plan_data, day) })), [dashboard?.workout]);
  const dietDays = useMemo(() => DAYS.map((day) => ({ day, data: getDietDay(dashboard?.diet?.plan_data, day) })), [dashboard?.diet]);

  const todayWorkoutData = workoutDays.find(d => d.day === currentDayStr)?.data;
  const todayDietData = dietDays.find(d => d.day === currentDayStr)?.data;
  
  const isTodayWorkoutCompleted = workoutActivity[currentDayStr]?.completed || false;
  const isTodayDietCompleted = dietActivity[currentDayStr]?.completed || false;

  // ------------------------------------------------------------
  // WORKOUT TRACKING LOGIC
  // ------------------------------------------------------------
  const startWorkout = () => {
    // Prep payload based on prescribed plan
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
    
    // Optimistic UI Update
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
      fetchDashboard(); // Revert on failure
    } finally {
      setActivityLoading(null);
    }
  };

  // ------------------------------------------------------------
  // DIET TRACKING LOGIC
  // ------------------------------------------------------------
  const openDietMealTracker = (title: string, meal: any, index: number) => {
    setActiveDietMeal({ title, meal, index });
    
    // Load previous tracking if exists
    const existingTracking = dietActivity[currentDayStr]?.tracking_data?.[title]?.[index];
    if (existingTracking) {
      setActiveDietForm({ status: existingTracking.status, reason: existingTracking.reason });
    } else {
      setActiveDietForm({ status: 'Followed', reason: '' });
    }
    
    setDietModalOpen(true);
  };

  const saveDietMeal = async () => {
    if (!activeDietMeal) return;
    const day = currentDayStr;
    setActivityLoading(`diet-${day}`);

    const currentTrackingData = dietActivity[day]?.tracking_data || {};
    const updatedCategory = [...(currentTrackingData[activeDietMeal.title] || [])];
    
    // Ensure array is large enough
    while (updatedCategory.length <= activeDietMeal.index) { updatedCategory.push(null); }
    updatedCategory[activeDietMeal.index] = { 
      prescribed_meal: getMealName(activeDietMeal.meal),
      status: activeDietForm.status, 
      reason: activeDietForm.reason 
    };

    const newTrackingData = { ...currentTrackingData, [activeDietMeal.title]: updatedCategory };
    
    // Auto-complete the day if all meals have tracking data (Simplified logic: we just mark it true if they track anything for now, or you can require all meals)
    const isCompleted = true; 

    setDietActivity(prev => ({ ...prev, [day]: { completed: isCompleted, tracking_data: newTrackingData } }));
    setDietModalOpen(false);

    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'diet', day, week_number: currentWeek, completed: isCompleted, tracking_data: newTrackingData }),
      });
    } catch (err) {
      alert('Failed to save diet data.');
      fetchDashboard();
    } finally {
      setActivityLoading(null);
    }
  };

  // Render Loading / Auth logic... (Assuming same as previous step for brevity)
  if (loading) return <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <header className="border-b border-slate-800 bg-slate-950/90 pt-8 pb-6 px-6 md:px-8">
        <div className="mx-auto max-w-5xl flex justify-between">
          <div>
            <p className="text-emerald-400 font-semibold mb-1 text-sm"><CalendarDays className="w-4 h-4 inline" /> Week {currentWeek} • {currentDayStr}</p>
            <h1 className="text-3xl font-bold">Good morning, {user?.firstName}</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-6 md:px-8">
        
        {/* TODAY'S WORKOUT */}
        <section className="mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Today's Workout</h2>
          <div className={`border rounded-2xl overflow-hidden ${isTodayWorkoutCompleted ? 'bg-indigo-950/20 border-indigo-500/30' : 'bg-slate-900 border-slate-800'}`}>
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">{todayWorkoutData?.focus || 'Training'}</h3>
                  <p className="text-slate-400 mt-1">{todayWorkoutData?.duration_minutes} mins • {todayWorkoutData?.exercises?.length || 0} exercises</p>
                </div>
                {isTodayWorkoutCompleted && <span className="bg-indigo-500/20 text-indigo-300 px-3 py-1 rounded-full text-xs font-bold"><CheckCircle2 className="w-4 h-4 inline mr-1"/> Completed</span>}
              </div>

              <button
                disabled={activityLoading === `workout-${currentDayStr}`}
                onClick={isTodayWorkoutCompleted ? startWorkout : startWorkout}
                className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 ${
                  isTodayWorkoutCompleted ? 'bg-slate-800 text-slate-300' : 'bg-indigo-600 text-white'
                }`}
              >
                {activityLoading === `workout-${currentDayStr}` ? <Loader2 className="animate-spin" /> : (isTodayWorkoutCompleted ? 'Review Activity' : <><Play className="w-5 h-5"/> Start Workout</>)}
              </button>
            </div>
          </div>
        </section>

        {/* TODAY'S DIET */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4">Today's Diet</h2>
          <div className={`border rounded-2xl p-6 ${isTodayDietCompleted ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-900 border-slate-800'}`}>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { title: 'Breakfast', meals: normalizeMeals(todayDietData?.breakfast) },
                { title: 'Lunch', meals: normalizeMeals(todayDietData?.lunch) },
                { title: 'Dinner', meals: normalizeMeals(todayDietData?.dinner) },
                { title: 'Snacks', meals: normalizeMeals(todayDietData?.snacks) }
              ].map(({title, meals}) => (
                <div key={title} className="bg-slate-950/50 rounded-xl p-4 border border-slate-800/50">
                  <p className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3">{title}</p>
                  {meals.length > 0 ? meals.map((meal, idx) => {
                    // Check if this specific meal has tracking data
                    const tracking = dietActivity[currentDayStr]?.tracking_data?.[title]?.[idx];
                    return (
                      <div key={idx} onClick={() => openDietMealTracker(title, meal, idx)} className="mb-3 last:mb-0 cursor-pointer hover:bg-slate-800 p-2 -mx-2 rounded-lg transition-colors border border-transparent hover:border-slate-700 flex justify-between items-center">
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

      </main>

      {/* ====================================================
          WORKOUT TRACKING MODAL
      ==================================================== */}
      {workoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/90 p-4 md:p-10 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950">
              <h2 className="text-xl font-bold text-white flex items-center gap-2"><Dumbbell className="text-indigo-400"/> Workout Execution</h2>
              <button onClick={() => setWorkoutModalOpen(false)} className="text-slate-500 hover:text-white"><X /></button>
            </div>
            
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
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
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Actual Reps (Avg)</label>
                      <input type="text" value={ex.actual_reps} onChange={(e) => updateExerciseTracking(idx, 'actual_reps', e.target.value)} className="w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white" placeholder="e.g. 10,10,8" />
                    </div>
                  </div>
                </div>
              ))}

              <div className="bg-indigo-950/20 rounded-xl p-5 border border-indigo-500/20 mt-6">
                <h4 className="text-sm font-bold text-indigo-300 uppercase tracking-wider mb-4">Overall Feedback</h4>
                <select value={activeWorkoutData.feedback?.difficulty} onChange={(e) => setActiveWorkoutData({...activeWorkoutData, feedback: {...activeWorkoutData.feedback, difficulty: e.target.value}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white mb-4">
                  <option>Easy</option>
                  <option>Just Right</option>
                  <option>Hard</option>
                </select>
                <textarea placeholder="Any notes on this workout?" value={activeWorkoutData.feedback?.notes} onChange={(e) => setActiveWorkoutData({...activeWorkoutData, feedback: {...activeWorkoutData.feedback, notes: e.target.value}})} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white" rows={2}></textarea>
              </div>
            </div>

            <div className="p-5 border-t border-slate-800 bg-slate-950">
              <button onClick={finishWorkout} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-xl">Save & Complete Workout</button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          DIET TRACKING MODAL
      ==================================================== */}
      {dietModalOpen && activeDietMeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 p-5">
              <h2 className="text-lg font-bold text-white">{activeDietMeal.title} Tracking</h2>
              <button onClick={() => setDietModalOpen(false)} className="text-slate-500"><X /></button>
            </div>
            <div className="p-6">
              <div className="mb-6 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-sm text-slate-400">Prescribed Meal:</p>
                <p className="text-lg font-semibold text-white mt-1">{getMealName(activeDietMeal.meal)}</p>
              </div>

              <label className="text-sm font-bold text-slate-300 mb-2 block">Did you follow this?</label>
              <div className="grid grid-cols-3 gap-2 mb-6">
                {['Followed', 'Swapped', 'Skipped'].map((status) => (
                  <button key={status} onClick={() => setActiveDietForm({...activeDietForm, status: status as DietStatus})} className={`py-2 rounded-lg text-sm font-bold border ${activeDietForm.status === status ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}>
                    {status}
                  </button>
                ))}
              </div>

              {activeDietForm.status !== 'Followed' && (
                <div className="mb-4">
                  <label className="text-sm font-bold text-slate-300 mb-2 block">Reason / What did you eat?</label>
                  <textarea value={activeDietForm.reason} onChange={(e) => setActiveDietForm({...activeDietForm, reason: e.target.value})} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white" rows={3} placeholder={activeDietForm.status === 'Swapped' ? "e.g., Ate outside, had a sandwich instead." : "e.g., Wasn't hungry."}></textarea>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-slate-800">
              <button onClick={saveDietMeal} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl">Save Log</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
