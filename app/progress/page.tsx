'use client';

import { useEffect, useState, useMemo } from 'react';
import { useUser, useClerk } from '@clerk/nextjs';
import Link from 'next/link';
import { Loader2, Dumbbell, Utensils, ChevronDown, ChevronUp, BrainCircuit, Activity, AlertCircle, TrendingUp, Settings, LogOut, RefreshCw, Sparkles } from 'lucide-react';

export default function ProgressPage() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  
  const [expandedWeek, setExpandedWeek] = useState<number | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string>('');
  
  const [aiInsights, setAiInsights] = useState<any[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    if (!isLoaded || !user) return;
    const fetchProgress = async () => {
      try {
        const res = await fetch('/api/progress');
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (err) { console.error('Failed to fetch progress'); } 
      finally { setLoading(false); }
    };
    fetchProgress();
  }, [isLoaded, user]);

  const weeklyStats = useMemo(() => {
    if (!data) return [];
    const weeks = new Set([...data.workoutPlans.map((w: any) => w.week_number), ...data.dietPlans.map((d: any) => d.week_number)]);

    return Array.from(weeks).sort((a, b) => b - a).map(weekNum => {
      const wPlan = data.workoutPlans.find((p: any) => p.week_number === weekNum);
      const wLogs = data.workoutLogs.filter((l: any) => l.week_number === weekNum);
      const dLogs = data.dietLogs.filter((l: any) => l.week_number === weekNum);
      const checkin = data.checkins.find((c: any) => c.week_number === weekNum);

      let wScheduled = 0;
      if (wPlan?.plan_data) {
        Object.values(wPlan.plan_data).forEach((day: any) => { if (day.duration_minutes > 0 && !String(day.focus).toLowerCase().includes('rest')) wScheduled++; });
      }

      return { week: weekNum, isActive: wPlan?.is_active || false, wCompleted: wLogs.filter((l: any) => l.completed).length, wScheduled: wScheduled || 0, dCompleted: dLogs.filter((l: any) => l.completed).length, checkin };
    });
  }, [data]);

  const dietAnalytics = useMemo(() => {
    if (!data) return { followed: 0, swapped: 0, skipped: 0, reasons: {} as Record<string, number>, totalTracked: 0 };
    let followed = 0, swapped = 0, skipped = 0;
    const reasons: Record<string, number> = {};

    data.dietLogs.forEach((log: any) => {
      if (!log.tracking_data) return;
      Object.values(log.tracking_data).forEach((mealArray: any) => {
        if (!Array.isArray(mealArray)) return;
        mealArray.forEach(meal => {
          if (!meal) return;
          if (meal.status === 'Followed') followed++;
          if (meal.status === 'Swapped') swapped++;
          if (meal.status === 'Skipped') skipped++;
          if (meal.reason && meal.reason.trim() !== '') {
            const cleanReason = meal.reason.trim().toLowerCase();
            reasons[cleanReason] = (reasons[cleanReason] || 0) + 1;
          }
        });
      });
    });
    return { followed, swapped, skipped, reasons, totalTracked: followed + swapped + skipped };
  }, [data]);

  const exerciseAnalytics = useMemo(() => {
    if (!data) return {};
    const stats: Record<string, Record<number, { avgReps: number, avgSets: number, raw: string[] }>> = {};

    data.workoutLogs.forEach((log: any) => {
      if (!log.completed || !log.tracking_data?.exercises) return;
      const week = log.week_number;
      log.tracking_data.exercises.forEach((ex: any) => {
        if (!ex.name) return;
        if (!stats[ex.name]) stats[ex.name] = {};
        if (!stats[ex.name][week]) stats[ex.name][week] = { avgReps: 0, avgSets: 0, raw: [] };
        
        let totalReps = 0, validSets = 0;
        String(ex.actual_reps || '').split(',').forEach(r => { const num = parseInt(r.trim()); if (!isNaN(num)) { totalReps += num; validSets++; } });
        stats[ex.name][week].avgReps = validSets > 0 ? totalReps / validSets : 0;
        stats[ex.name][week].avgSets = parseInt(ex.actual_sets) || 0;
        stats[ex.name][week].raw.push(`Sets: ${ex.actual_sets || 0}, Reps: ${ex.actual_reps || '0'}`);
      });
    });
    return stats;
  }, [data]);

  const exerciseNames = Object.keys(exerciseAnalytics).sort();

  const generateInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch('/api/progress-intelligence', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exerciseStats: exerciseAnalytics, dietStats: dietAnalytics, checkins: data.checkins.map((c: any) => ({ week: c.week_number, weight: c.weight_kg, difficulty: c.workout_difficulty })) })
      });
      const json = await res.json();
      if (json.success) setAiInsights(json.insights); else throw new Error(json.error);
    } catch (err) { alert('Failed to generate insights.'); } 
    finally { setLoadingInsights(false); }
  };

  if (!isLoaded || loading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8"/></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      
      {/* UNIFIED NAVIGATION HEADER */}
      <header className="border-b border-slate-800 bg-slate-950/90 sticky top-0 z-40 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-6 md:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold text-white hidden md:block tracking-tight text-indigo-400">AI Coach</h1>
            <nav className="flex gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
              <Link href="/dashboard" className="px-4 py-2 text-slate-400 hover:text-white rounded-lg text-sm font-semibold transition-colors">Home</Link>
              <Link href="/plan" className="px-4 py-2 text-slate-400 hover:text-white rounded-lg text-sm font-semibold transition-colors">Plan</Link>
              <Link href="/progress" className="px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold shadow">Progress</Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/settings" className="p-2.5 text-slate-400 hover:text-white bg-slate-900 border border-slate-800 rounded-xl transition-colors"><Settings className="w-5 h-5"/></Link>
            <button onClick={() => signOut({ redirectUrl: '/login' })} className="p-2.5 text-slate-400 hover:text-red-400 bg-slate-900 border border-slate-800 rounded-xl transition-colors"><LogOut className="w-5 h-5"/></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 md:px-8 space-y-10">
        
        {/* TITLE */}
        <div className="flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-indigo-400" />
          <h1 className="text-3xl font-bold tracking-tight text-white">Progress Intelligence</h1>
        </div>

        <section className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3"><div className="bg-indigo-500/20 p-2 rounded-xl"><BrainCircuit className="w-6 h-6 text-indigo-400"/></div><div><h2 className="text-xl font-bold text-white">AI Analyst Insights</h2><p className="text-sm text-slate-400 mt-1">Evidence-based analysis of your historical data.</p></div></div>
            {aiInsights.length === 0 && <button disabled={loadingInsights} onClick={generateInsights} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-all">{loadingInsights ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} Analyze</button>}
          </div>

          {aiInsights.length > 0 && (
            <div className="space-y-3">
              {aiInsights.map((insight, idx) => (
                <div key={idx} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex gap-4 items-start"><div className={`mt-1 rounded-full w-2 h-2 shrink-0 ${insight.trend === 'positive' ? 'bg-emerald-500' : insight.trend === 'negative' ? 'bg-red-500' : 'bg-slate-400'}`}></div><div><p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">{insight.category}</p><p className="text-slate-200 text-sm leading-relaxed">{insight.insight}</p></div></div>
              ))}
              <button onClick={generateInsights} disabled={loadingInsights} className="mt-4 text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><RefreshCw className={`w-3 h-3 ${loadingInsights ? 'animate-spin' : ''}`}/> Re-analyze</button>
            </div>
          )}
        </section>

        <div className="grid md:grid-cols-2 gap-8">
          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6"><Activity className="w-5 h-5 text-indigo-400" /><h2 className="text-lg font-bold text-white">Exercise History</h2></div>
            {exerciseNames.length === 0 ? <p className="text-sm text-slate-500 text-center py-6">No tracking data available yet.</p> : (
              <div>
                <select value={selectedExercise} onChange={(e) => setSelectedExercise(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none mb-6"><option value="" disabled>Select an exercise...</option>{exerciseNames.map(name => <option key={name} value={name}>{name}</option>)}</select>
                {selectedExercise && exerciseAnalytics[selectedExercise] && (
                  <div className="space-y-4">
                    {Object.keys(exerciseAnalytics[selectedExercise]).sort().map(week => {
                      const stats = exerciseAnalytics[selectedExercise][parseInt(week)];
                      return <div key={week} className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex justify-between items-center"><p className="font-semibold text-slate-300">Week {week}</p><div className="text-right"><p className="text-sm text-white font-bold">{stats.avgSets} Sets</p><p className="text-xs text-slate-500">Avg {stats.avgReps.toFixed(1)} reps/set</p></div></div>
                    })}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6"><Utensils className="w-5 h-5 text-emerald-400" /><h2 className="text-lg font-bold text-white">Diet Adherence</h2></div>
            {dietAnalytics.totalTracked === 0 ? <p className="text-sm text-slate-500 text-center py-6">No diet tracking data yet.</p> : (
              <div>
                <div className="w-full h-3 rounded-full flex overflow-hidden mb-6 bg-slate-800"><div style={{width: `${(dietAnalytics.followed / dietAnalytics.totalTracked) * 100}%`}} className="h-full bg-emerald-500"></div><div style={{width: `${(dietAnalytics.swapped / dietAnalytics.totalTracked) * 100}%`}} className="h-full bg-orange-500"></div><div style={{width: `${(dietAnalytics.skipped / dietAnalytics.totalTracked) * 100}%`}} className="h-full bg-red-500"></div></div>
                <div className="grid grid-cols-3 gap-2 text-center mb-8"><div className="bg-slate-950 p-3 rounded-lg border border-emerald-500/20"><p className="text-xl font-bold text-emerald-400">{dietAnalytics.followed}</p><p className="text-[10px] uppercase font-bold text-slate-500">Followed</p></div><div className="bg-slate-950 p-3 rounded-lg border border-orange-500/20"><p className="text-xl font-bold text-orange-400">{dietAnalytics.swapped}</p><p className="text-[10px] uppercase font-bold text-slate-500">Swapped</p></div><div className="bg-slate-950 p-3 rounded-lg border border-red-500/20"><p className="text-xl font-bold text-red-400">{dietAnalytics.skipped}</p><p className="text-[10px] uppercase font-bold text-slate-500">Skipped</p></div></div>
                {Object.keys(dietAnalytics.reasons).length > 0 && <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Top Reasons for Swap/Skip</p><div className="space-y-2">{Object.entries(dietAnalytics.reasons).sort((a,b) => b[1] - a[1]).slice(0,3).map(([reason, count]) => <div key={reason} className="flex justify-between text-sm bg-slate-950/50 p-2.5 rounded-lg border border-slate-800"><span className="text-slate-300 truncate pr-4 capitalize">{reason}</span><span className="text-slate-500 font-medium shrink-0">{count}x</span></div>)}</div></div>}
              </div>
            )}
          </section>
        </div>

        <section>
          <h2 className="text-xl font-bold text-white mb-4">Historical Archives</h2>
          {weeklyStats.length === 0 ? <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">No history available yet.</div> : (
            <div className="space-y-4">
              {weeklyStats.map((stat) => (
                <div key={stat.week} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <button onClick={() => setExpandedWeek(expandedWeek === stat.week ? null : stat.week)} className="w-full p-5 flex items-center justify-between hover:bg-slate-800/50 transition-colors text-left">
                    <div><div className="flex items-center gap-3"><h3 className="text-lg font-bold text-white">Week {stat.week}</h3>{stat.isActive && <span className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-1 rounded-full font-semibold tracking-wide uppercase">Active</span>}</div><div className="flex gap-4 mt-2 text-sm text-slate-400"><span className="flex items-center gap-1"><Dumbbell className="w-3 h-3"/> {stat.wCompleted} / {stat.wScheduled}</span><span className="flex items-center gap-1"><Utensils className="w-3 h-3"/> {stat.dCompleted} / 7</span></div></div>
                    {expandedWeek === stat.week ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                  </button>
                  {expandedWeek === stat.week && (
                    <div className="p-5 border-t border-slate-800 bg-slate-950/50 space-y-6">
                      {stat.checkin ? (
                        <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4"><p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-2">Weekly Check-in</p><div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3 text-sm"><div><span className="text-slate-500">Weight:</span> <span className="text-white font-medium">{stat.checkin.weight_kg} kg</span></div><div><span className="text-slate-500">Energy:</span> <span className="text-white font-medium">{stat.checkin.energy_rating}/5</span></div><div><span className="text-slate-500">Difficulty:</span> <span className="text-white font-medium">{stat.checkin.workout_difficulty}</span></div></div>{stat.checkin.ai_analysis && <div className="mt-3 pt-3 border-t border-indigo-500/20"><span className="text-slate-500 text-sm font-semibold">Adaptation Note:</span><p className="text-slate-300 text-sm mt-1 leading-relaxed">{stat.checkin.ai_analysis}</p></div>}</div>
                      ) : <p className="text-sm text-slate-500 italic flex items-center gap-2"><AlertCircle className="w-4 h-4"/> No check-in recorded.</p>}
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
