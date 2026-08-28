'use client';

import { useEffect, useState, useMemo } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import { Loader2, ArrowLeft, Target, Dumbbell, Utensils, CalendarDays, History, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';

export default function ProgressPage() {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);

  useEffect(() => {
    if (!isLoaded || !user) return;
    const fetchProgress = async () => {
      try {
        const res = await fetch('/api/progress');
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (err) {
        console.error('Failed to fetch progress');
      } finally {
        setLoading(false);
      }
    };
    fetchProgress();
  }, [isLoaded, user]);

  // Aggregate Data by Week
  const weeklyStats = useMemo(() => {
    if (!data) return [];
    
    // Find all unique weeks
    const weeks = new Set([
      ...data.workoutPlans.map((w: any) => w.week_number),
      ...data.dietPlans.map((d: any) => d.week_number)
    ]);

    return Array.from(weeks).sort((a, b) => b - a).map(weekNum => {
      const wPlan = data.workoutPlans.find((p: any) => p.week_number === weekNum);
      const dPlan = data.dietPlans.find((p: any) => p.week_number === weekNum);
      const wLogs = data.workoutLogs.filter((l: any) => l.week_number === weekNum);
      const dLogs = data.dietLogs.filter((l: any) => l.week_number === weekNum);
      const checkin = data.checkins.find((c: any) => c.week_number === weekNum);

      const wCompleted = wLogs.filter((l: any) => l.completed).length;
      const dCompleted = dLogs.filter((l: any) => l.completed).length;

      // Estimate total scheduled workouts (excluding Rest days)
      let wScheduled = 0;
      if (wPlan?.plan_data) {
        Object.values(wPlan.plan_data).forEach((day: any) => {
          if (day.duration_minutes > 0 && !String(day.focus).toLowerCase().includes('rest')) wScheduled++;
        });
      }

      return {
        week: weekNum,
        isActive: wPlan?.is_active || false,
        wCompleted,
        wScheduled: wScheduled || 0,
        dCompleted,
        checkin
      };
    });
  }, [data]);

  if (!isLoaded || loading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8"/></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-950/90 pt-8 pb-6 px-6 md:px-8">
        <div className="mx-auto max-w-5xl">
          <button onClick={() => window.location.href = '/dashboard'} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-indigo-400" />
            <h1 className="text-3xl font-bold tracking-tight text-white">Your Progress</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 md:px-8 space-y-8">
        
        {/* Lifetime Summary */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <CalendarDays className="w-5 h-5 text-indigo-400 mb-2" />
            <p className="text-slate-400 text-sm">Weeks Active</p>
            <p className="text-2xl font-bold text-white">{weeklyStats.length}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <Dumbbell className="w-5 h-5 text-emerald-400 mb-2" />
            <p className="text-slate-400 text-sm">Workouts Done</p>
            <p className="text-2xl font-bold text-white">{data?.workoutLogs.filter((l:any)=>l.completed).length || 0}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <Utensils className="w-5 h-5 text-orange-400 mb-2" />
            <p className="text-slate-400 text-sm">Diet Days Hit</p>
            <p className="text-2xl font-bold text-white">{data?.dietLogs.filter((l:any)=>l.completed).length || 0}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <History className="w-5 h-5 text-blue-400 mb-2" />
            <p className="text-slate-400 text-sm">Check-ins</p>
            <p className="text-2xl font-bold text-white">{data?.checkins.length || 0}</p>
          </div>
        </section>

        {/* History by Week */}
        <section>
          <h2 className="text-xl font-bold text-white mb-4">History by Week</h2>
          
          {weeklyStats.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
              No history available yet. Complete your first week!
            </div>
          ) : (
            <div className="space-y-4">
              {weeklyStats.map((stat) => (
                <div key={stat.week} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <button 
                    onClick={() => setExpandedWeek(expandedWeek === stat.week ? null : stat.week)}
                    className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50 transition-colors text-left"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-white">Week {stat.week}</h3>
                        {stat.isActive && <span className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-1 rounded-full font-semibold tracking-wide uppercase">Active Now</span>}
                      </div>
                      <div className="flex gap-4 mt-2 text-sm text-slate-400">
                        <span className="flex items-center gap-1"><Dumbbell className="w-3 h-3"/> {stat.wCompleted} / {stat.wScheduled}</span>
                        <span className="flex items-center gap-1"><Utensils className="w-3 h-3"/> {stat.dCompleted} / 7</span>
                      </div>
                    </div>
                    {expandedWeek === stat.week ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                  </button>

                  {expandedWeek === stat.week && (
                    <div className="p-5 border-t border-slate-800 bg-slate-950/50 space-y-6">
                      
                      {/* Read-Only Adaptation / Feedback History */}
                      {stat.checkin ? (
                        <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4">
                          <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">Weekly Check-in Summary</p>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
                            <div><span className="text-slate-500">Weight:</span> <span className="text-white font-medium">{stat.checkin.weight_kg} kg</span></div>
                            <div><span className="text-slate-500">Energy:</span> <span className="text-white font-medium">{stat.checkin.energy_rating}/5</span></div>
                            <div><span className="text-slate-500">Difficulty:</span> <span className="text-white font-medium">{stat.checkin.workout_difficulty}</span></div>
                          </div>
                          {stat.checkin.ai_analysis && (
                            <div className="mt-3 pt-3 border-t border-indigo-500/20">
                              <span className="text-slate-500 text-sm">AI Note:</span>
                              <p className="text-slate-300 text-sm mt-1 leading-relaxed">{stat.checkin.ai_analysis}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic">No check-in recorded for this week.</p>
                      )}

                      <div className="text-sm text-slate-400 bg-slate-900 p-4 rounded-xl border border-slate-800 text-center">
                        <Target className="w-5 h-5 mx-auto mb-2 text-slate-500" />
                        Plan details and exercise-level tracking history will be injected here.
                      </div>

                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
