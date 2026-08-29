'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Loader2, ArrowLeft, Dumbbell, Utensils, RefreshCw, X, AlertCircle } from 'lucide-react';

export default function PlanDetailsPage() {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  
  const [activeTab, setActiveTab] = useState<'workout' | 'diet'>('workout');
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Swap Modal State
  const [swapModal, setSwapModal] = useState<{isOpen: boolean, type: string, day: string, item: any, itemName: string} | null>(null);
  const [swapReason, setSwapReason] = useState('');
  const [swapping, setSwapping] = useState(false);

  const fetchPlanData = async () => {
    try {
      const response = await fetch('/api/dashboard-data');
      const data = await response.json();
      setDashboard(data);
    } catch (err) {
      console.error('Failed to load plan');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded && user) fetchPlanData();
  }, [isLoaded, user]);

  const handleSwapRequest = async () => {
    if (!swapModal) return;
    setSwapping(true);
    
    try {
      const planId = swapModal.type === 'workout' ? dashboard.workout.id : dashboard.diet.id;
      const res = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: swapModal.type,
          planId: planId,
          day: swapModal.day,
          originalItemName: swapModal.itemName,
          reason: swapReason,
          profileData: dashboard.profile
        })
      });

      if (!res.ok) throw new Error('Failed to swap');
      
      // Refresh to get new modifications
      await fetchPlanData();
      setSwapModal(null);
      setSwapReason('');
    } catch (err) {
      alert('Failed to generate replacement. Please try again.');
    } finally {
      setSwapping(false);
    }
  };

  if (!isLoaded || loading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8"/></div>;

  const workoutMods = dashboard?.workout?.modifications || {};
  const dietMods = dashboard?.diet?.modifications || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <header className="border-b border-slate-800 bg-slate-950/90 pt-8 pb-6 px-6 md:px-8">
        <div className="mx-auto max-w-5xl">
          <button onClick={() => window.location.href = '/dashboard'} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <h1 className="text-3xl font-bold tracking-tight text-white">Current Plan Details</h1>
          <p className="text-slate-400 mt-1">Week {dashboard?.workout?.week_number || 1} • Inspect or tweak your AI prescribed plan.</p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 md:px-8">
        
        {/* Tabs */}
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 mb-8 max-w-sm">
          <button onClick={() => setActiveTab('workout')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'workout' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <Dumbbell className="w-4 h-4"/> Workout
          </button>
          <button onClick={() => setActiveTab('diet')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'diet' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <Utensils className="w-4 h-4"/> Diet
          </button>
        </div>

        {/* WORKOUT TAB */}
        {activeTab === 'workout' && dashboard?.workout?.plan_data && (
          <div className="space-y-6">
            {DAYS.map(day => {
              const dayData = dashboard.workout.plan_data[day] || dashboard.workout.plan_data.workout?.[day];
              if (!dayData || !dayData.exercises) return null;

              return (
                <div key={day} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-xl font-bold text-white mb-1">{day}</h3>
                  <p className="text-sm text-indigo-400 mb-6">{dayData.focus || 'Training'} • {dayData.duration_minutes} mins</p>
                  
                  <div className="space-y-4">
                    {dayData.exercises.map((ex: any, idx: number) => {
                      const originalName = ex.name || ex.exercise;
                      const swappedEx = workoutMods[day]?.[originalName];

                      return (
                        <div key={idx} className="bg-slate-950/50 rounded-xl p-5 border border-slate-800 relative overflow-hidden">
                          {swappedEx ? (
                            // Showing Swapped Exercise
                            <div>
                              <div className="absolute top-0 right-0 bg-orange-500/20 text-orange-400 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase">AI Replaced</div>
                              <p className="line-through text-slate-600 text-sm mb-2">Original: {originalName}</p>
                              <h4 className="text-lg font-bold text-white">{swappedEx.name}</h4>
                              <p className="text-xs text-slate-400 mb-3">{swappedEx.notes}</p>
                              
                              <div className="flex gap-4 text-sm font-medium text-slate-300">
                                <span className="bg-slate-800 px-3 py-1.5 rounded-lg">{swappedEx.sets} Sets</span>
                                <span className="bg-slate-800 px-3 py-1.5 rounded-lg">{swappedEx.reps} Reps</span>
                                <span className="bg-slate-800 px-3 py-1.5 rounded-lg">{swappedEx.rest_seconds || '-'}s Rest</span>
                              </div>
                            </div>
                          ) : (
                            // Showing Original Exercise
                            <div>
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="text-lg font-bold text-white">{originalName}</h4>
                                  {ex.notes && <p className="text-xs text-slate-400 mb-3 mt-1 max-w-md">{ex.notes}</p>}
                                </div>
                                <button onClick={() => setSwapModal({isOpen: true, type: 'workout', day, item: ex, itemName: originalName})} className="text-xs font-semibold text-slate-400 hover:text-indigo-400 flex items-center gap-1 bg-slate-800/50 hover:bg-indigo-500/10 px-3 py-1.5 rounded-lg transition-colors">
                                  <RefreshCw className="w-3 h-3"/> Replace
                                </button>
                              </div>
                              <div className="flex gap-4 mt-3 text-sm font-medium text-slate-300">
                                <span className="bg-slate-800 px-3 py-1.5 rounded-lg">{ex.sets} Sets</span>
                                <span className="bg-slate-800 px-3 py-1.5 rounded-lg">{ex.reps} Reps</span>
                                <span className="bg-slate-800 px-3 py-1.5 rounded-lg">{ex.rest_seconds || ex.rest || '-'}s Rest</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DIET TAB */}
        {activeTab === 'diet' && dashboard?.diet?.plan_data && (
          <div className="space-y-6">
            {DAYS.map(day => {
              const dayData = dashboard.diet.plan_data[day] || dashboard.diet.plan_data.diet?.[day];
              if (!dayData || (!dayData.breakfast && !dayData.lunch && !dayData.dinner)) return null;

              return (
                <div key={day} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-xl font-bold text-white mb-4">{day} Nutrition</h3>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    {['breakfast', 'lunch', 'dinner', 'snacks'].map(mealType => {
                      let meals = dayData[mealType];
                      if (!meals) return null;
                      if (!Array.isArray(meals)) meals = [meals];

                      return (
                        <div key={mealType} className="bg-slate-950/50 rounded-xl p-5 border border-slate-800">
                          <p className="text-xs font-bold uppercase text-emerald-500 tracking-wider mb-3">{mealType}</p>
                          
                          {meals.map((meal: any, idx: number) => {
                            const originalName = meal.meal || meal.name;
                            const swappedMeal = dietMods[day]?.[originalName];

                            return (
                              <div key={idx} className="relative mb-4 last:mb-0">
                                {swappedMeal ? (
                                  <div className="bg-slate-900 p-3 rounded-lg border border-orange-500/20">
                                    <div className="absolute top-0 right-0 bg-orange-500/20 text-orange-400 text-[9px] font-bold px-2 py-0.5 rounded-bl-lg rounded-tr-lg uppercase">AI Replaced</div>
                                    <p className="line-through text-slate-600 text-xs mb-1">Orig: {originalName}</p>
                                    <p className="font-semibold text-white">{swappedMeal.meal}</p>
                                    <p className="text-xs text-slate-400 mt-1">{swappedMeal.ingredients || 'Ingredients adapted'}</p>
                                    <div className="flex gap-3 mt-2 text-xs font-bold">
                                      <span className="text-orange-400">{swappedMeal.calories} kcal</span>
                                      <span className="text-emerald-400">{swappedMeal.protein_g}g Pro</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex justify-between items-start group">
                                    <div>
                                      <p className="font-semibold text-slate-200">{originalName}</p>
                                      <div className="flex gap-3 mt-1 text-xs font-medium">
                                        <span className="text-orange-400">{meal.calories || 0} kcal</span>
                                        <span className="text-emerald-400">{meal.protein_g || meal.protein || 0}g Pro</span>
                                      </div>
                                    </div>
                                    <button onClick={() => setSwapModal({isOpen: true, type: 'diet', day, item: meal, itemName: originalName})} className="opacity-0 group-hover:opacity-100 text-xs font-semibold text-slate-400 hover:text-emerald-400 bg-slate-800/50 px-2 py-1 rounded transition-all">
                                      Swap
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>

      {/* SWAP MODAL */}
      {swapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <RefreshCw className={`w-5 h-5 ${swapModal.type === 'workout' ? 'text-indigo-400' : 'text-emerald-400'}`}/> 
                AI {swapModal.type === 'workout' ? 'Exercise' : 'Meal'} Swap
              </h2>
              <button onClick={() => setSwapModal(null)} disabled={swapping} className="text-slate-500 hover:text-white"><X /></button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Original Item</p>
                <p className="font-semibold text-slate-200">{swapModal.itemName}</p>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-300 mb-2 block flex items-center gap-2">
                  Why do you need to change this? 
                  <AlertCircle className="w-4 h-4 text-slate-500"/>
                </label>
                <textarea 
                  value={swapReason} 
                  onChange={(e) => setSwapReason(e.target.value)} 
                  className={`w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-${swapModal.type === 'workout' ? 'indigo' : 'emerald'}-500`} 
                  rows={3} 
                  placeholder={swapModal.type === 'workout' ? "e.g., Don't have a barbell, hurts my shoulder." : "e.g., Don't have eggs, want something vegan."}
                ></textarea>
                <p className="text-xs text-slate-500 mt-2">The AI Coach will generate an alternative that matches the original intent, keeping historical data intact.</p>
              </div>
            </div>

            <div className="p-5 border-t border-slate-800 bg-slate-950">
              <button 
                onClick={handleSwapRequest} 
                disabled={swapping || !swapReason.trim()}
                className={`w-full font-bold py-3.5 rounded-xl transition-all flex justify-center items-center gap-2 disabled:opacity-50 ${swapModal.type === 'workout' ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}
              >
                {swapping ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating Alternative...</> : 'Request Alternative'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
