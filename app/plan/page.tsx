'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Loader2, ArrowLeft, Dumbbell, Utensils, RefreshCw, X, ShieldAlert, Sparkles, ChevronRight, Info } from 'lucide-react';
// IMPORT FROM THE FILE WE MADE IN STEP 1:
import { findKnowledge } from '@/lib/knowledge';

const WORKOUT_REASONS = ['Too difficult', 'Pain/discomfort', 'No equipment', "Don't know how to perform it", "Don't like it", 'Other'];
const DIET_REASONS = ['Food unavailable', 'Too expensive', "Don't like it", 'Not practical', 'Dietary preference', 'Other'];

export default function PlanDetailsPage() {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState<any>(null);
  
  const [activeTab, setActiveTab] = useState<'workout' | 'diet'>('workout');
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const [swapModal, setSwapModal] = useState<{isOpen: boolean, type: 'workout'|'diet', day: string, item: any, itemName: string} | null>(null);
  const [swapCategory, setSwapCategory] = useState('');
  const [swapDetails, setSwapDetails] = useState('');
  const [swapping, setSwapping] = useState(false);

  const [explainModalOpen, setExplainModalOpen] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanationData, setExplanationData] = useState<any>(null);

  // NEW KNOWLEDGE DETAILS MODAL STATE
  const [detailsModal, setDetailsModal] = useState<{isOpen: boolean, type: 'workout'|'diet', item: any, kbData: any} | null>(null);

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
    if (!swapModal || !swapCategory) return;
    setSwapping(true);
    try {
      const planId = swapModal.type === 'workout' ? dashboard.workout.id : dashboard.diet.id;
      
      // Check if we have knowledge rules to send to AI
      const kbData = findKnowledge(swapModal.itemName, swapModal.type);
      const kbContext = kbData && swapModal.type === 'workout' ? { regressions: kbData.regressions, progressions: kbData.progressions } : (kbData ? { substitutions: kbData.substitutions } : null);

      const res = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: swapModal.type, planId, day: swapModal.day,
          originalItemName: swapModal.itemName, reasonCategory: swapCategory,
          reasonDetails: swapDetails, profileData: dashboard.profile,
          kbContext // Send to AI
        })
      });
      if (!res.ok) throw new Error('Failed to swap');
      await fetchPlanData();
      setSwapModal(null);
      setSwapCategory('');
      setSwapDetails('');
    } catch (err) {
      alert('Failed to generate replacement.');
    } finally {
      setSwapping(false);
    }
  };

  const fetchExplanation = async () => {
    if (explanationData) { setExplainModalOpen(true); return; }
    setExplaining(true); setExplainModalOpen(true);
    try {
      const res = await fetch('/api/explain-plan', { method: 'POST' });
      const data = await res.json();
      if (data.success) setExplanationData(data.explanation);
    } catch (err) {} finally { setExplaining(false); }
  };

  if (!isLoaded || loading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8"/></div>;

  const workoutMods = dashboard?.workout?.modifications || {};
  const dietMods = dashboard?.diet?.modifications || {};

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <header className="border-b border-slate-800 bg-slate-950/90 pt-8 pb-6 px-6 md:px-8">
        <div className="mx-auto max-w-5xl">
          <button onClick={() => window.location.href = '/dashboard'} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">Plan Details</h1>
              <p className="text-slate-400 mt-1">Week {dashboard?.workout?.week_number || 1} • Inspect your plan or swap items safely.</p>
            </div>
            <button onClick={fetchExplanation} className="flex items-center gap-2 bg-indigo-950/30 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-900/40 px-4 py-2.5 rounded-xl text-sm font-bold transition-all">
              <Sparkles className="w-4 h-4" /> Why this plan?
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8 md:px-8">
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 mb-8 max-w-sm">
          <button onClick={() => setActiveTab('workout')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'workout' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <Dumbbell className="w-4 h-4"/> Workout
          </button>
          <button onClick={() => setActiveTab('diet')} className={`flex-1 flex justify-center items-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-colors ${activeTab === 'diet' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'}`}>
            <Utensils className="w-4 h-4"/> Diet
          </button>
        </div>

        {/* WORKOUT TAB */}
        {activeTab === 'workout' && (
          <div className="space-y-6">
            {DAYS.map(day => {
              const dayData = dashboard.workout?.plan_data?.[day] || dashboard.workout?.plan_data?.workout?.[day];
              if (!dayData || !dayData.exercises || dayData.exercises.length === 0) return null;

              return (
                <div key={day} className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                  <h3 className="text-xl font-bold text-white">{day}</h3>
                  <p className="text-sm text-indigo-400 mb-6">{dayData.focus || 'Training'} • {dayData.duration_minutes} mins</p>
                  
                  <div className="space-y-4">
                    {dayData.exercises.map((ex: any, idx: number) => {
                      const originalName = ex.name || ex.exercise;
                      const swappedEx = workoutMods[day]?.[originalName];
                      const activeItem = swappedEx || ex;
                      const displayName = swappedEx ? swappedEx.name : originalName;

                      return (
                        <div key={idx} className="bg-slate-950/50 rounded-xl p-5 border border-slate-800 relative">
                          {swappedEx && <div className="absolute top-0 right-0 bg-orange-500/20 text-orange-400 text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase">AI Replaced</div>}
                          {swappedEx && <p className="line-through text-slate-600 text-sm mb-2">Original: {originalName}</p>}
                          
                          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-lg font-bold text-white">{displayName}</h4>
                                <button onClick={() => {
                                  const kbData = findKnowledge(displayName, 'workout');
                                  setDetailsModal({ isOpen: true, type: 'workout', item: activeItem, kbData });
                                }} className="text-slate-400 hover:text-indigo-400 p-1 bg-slate-800 rounded-full transition-colors">
                                  <Info className="w-4 h-4"/>
                                </button>
                              </div>
                              <p className="text-sm text-slate-400 mb-4 mt-1">{activeItem.notes}</p>
                              <div className="flex flex-wrap gap-2 text-sm font-medium text-slate-300">
                                <span className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">{activeItem.sets} Sets</span>
                                <span className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">{activeItem.reps} Reps</span>
                              </div>
                            </div>
                            {!swappedEx && (
                              <button onClick={() => setSwapModal({isOpen: true, type: 'workout', day, item: ex, itemName: originalName})} className="w-full sm:w-auto bg-slate-800 hover:bg-indigo-600 text-indigo-400 hover:text-white px-4 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition-colors border border-slate-700">
                                <RefreshCw className="w-4 h-4"/> Swap Exercise
                              </button>
                            )}
                          </div>
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
        {activeTab === 'diet' && (
          <div className="space-y-6">
            {DAYS.map(day => {
              const dayData = dashboard.diet?.plan_data?.[day] || dashboard.diet?.plan_data?.diet?.[day];
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
                          <p className="text-xs font-bold uppercase text-emerald-500 tracking-wider mb-4">{mealType}</p>
                          {meals.map((meal: any, idx: number) => {
                            const originalName = meal.meal || meal.name;
                            const swappedMeal = dietMods[day]?.[originalName];
                            const activeItem = swappedMeal || meal;
                            const displayName = swappedMeal ? swappedMeal.meal : originalName;

                            return (
                              <div key={idx} className="relative mb-6 last:mb-0 bg-slate-900 p-4 rounded-xl border border-slate-800">
                                {swappedMeal && <div className="absolute top-0 right-0 bg-orange-500/20 text-orange-400 text-[10px] font-bold px-2 py-1 rounded-bl-lg uppercase">AI Replaced</div>}
                                {swappedMeal && <p className="line-through text-slate-600 text-xs mb-2">Original: {originalName}</p>}

                                <div className="flex flex-col items-start gap-4">
                                  <div className="w-full">
                                    <div className="flex items-center gap-2">
                                      <p className="font-bold text-white text-lg">{displayName}</p>
                                      <button onClick={() => {
                                        const kbData = findKnowledge(displayName, 'diet');
                                        setDetailsModal({ isOpen: true, type: 'diet', item: activeItem, kbData });
                                      }} className="text-slate-400 hover:text-emerald-400 p-1 bg-slate-800 rounded-full transition-colors">
                                        <Info className="w-4 h-4"/>
                                      </button>
                                    </div>
                                    <div className="flex gap-3 mt-2 text-sm font-bold">
                                      <span className="text-orange-400">{activeItem.calories || 0} kcal</span>
                                      <span className="text-emerald-400">{activeItem.protein_g || activeItem.protein || 0}g Pro</span>
                                    </div>
                                  </div>
                                  {!swappedMeal && (
                                    <button onClick={() => setSwapModal({isOpen: true, type: 'diet', day, item: meal, itemName: originalName})} className="w-full bg-slate-800 hover:bg-emerald-600 text-emerald-400 hover:text-white px-4 py-2 rounded-lg text-sm font-bold flex justify-center items-center gap-2 transition-colors border border-slate-700">
                                      <RefreshCw className="w-4 h-4"/> Swap Meal
                                    </button>
                                  )}
                                </div>
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
                AI Swap
              </h2>
              <button onClick={() => setSwapModal(null)} disabled={swapping} className="text-slate-500 hover:text-white"><X /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-500 uppercase font-bold tracking-wider mb-1">Prescribed Item</p>
                <p className="font-semibold text-slate-200">{swapModal.itemName}</p>
              </div>
              <div>
                <label className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">Why do you need to change this?</label>
                <div className="flex flex-wrap gap-2">
                  {(swapModal.type === 'workout' ? WORKOUT_REASONS : DIET_REASONS).map(reason => (
                    <button key={reason} onClick={() => setSwapCategory(reason)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${swapCategory === reason ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
              {swapCategory === 'Pain/discomfort' && (
                <div className="bg-red-950/30 border border-red-900/50 p-3 rounded-lg flex gap-3 items-start">
                  <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                  <div><p className="text-sm font-bold text-red-400">Safety First</p><p className="text-xs text-slate-300 mt-1">If you are experiencing sharp pain, skip this movement entirely.</p></div>
                </div>
              )}
              <div className="pt-2">
                <textarea value={swapDetails} onChange={(e) => setSwapDetails(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:border-indigo-500 text-sm" rows={2} placeholder="Any specific constraints? (Optional)"></textarea>
              </div>
            </div>
            <div className="p-5 border-t border-slate-800 bg-slate-950">
              <button onClick={handleSwapRequest} disabled={swapping || !swapCategory} className={`w-full font-bold py-3.5 rounded-xl flex justify-center items-center gap-2 disabled:opacity-50 ${swapCategory ? (swapModal.type === 'workout' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white') : 'bg-slate-800 text-slate-500'}`}>
                {swapping ? <><Loader2 className="w-5 h-5 animate-spin" /> Generating...</> : 'Request Alternative'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPLANATION MODAL */}
      {explainModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-indigo-500/30 bg-slate-900 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-indigo-950/20">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-400"/> AI Plan Insights</h2>
              <button onClick={() => setExplainModalOpen(false)} className="text-slate-500 hover:text-white"><X /></button>
            </div>
            <div className="p-6 overflow-y-auto">
              {explaining ? (
                <div className="flex flex-col items-center justify-center py-12 text-indigo-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p className="font-semibold">Analyzing plan decisions...</p>
                </div>
              ) : explanationData ? (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2"><Dumbbell className="w-4 h-4 text-indigo-400"/> Workout Rationale</h3>
                    <p className="text-slate-300 text-sm leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">{explanationData.workout_explanation}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-2"><Utensils className="w-4 h-4 text-emerald-400"/> Diet Rationale</h3>
                    <p className="text-slate-300 text-sm leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800">{explanationData.diet_explanation}</p>
                  </div>
                  {explanationData.changes && explanationData.changes.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3 mt-2">Week-over-Week Changes</h3>
                      <div className="space-y-3">
                        {explanationData.changes.map((change: any, i: number) => (
                          <div key={i} className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                            <p className="font-bold text-slate-200">{change.item}</p>
                            <p className="text-sm text-indigo-300 mt-1 flex items-center gap-1"><ChevronRight className="w-3 h-3"/> {change.change}</p>
                            <p className="text-xs text-slate-400 mt-2 italic bg-slate-900 p-2 rounded border border-slate-800">{change.reason}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : <p className="text-red-400 text-center py-6">Failed to load insights.</p>}
            </div>
          </div>
        </div>
      )}

      {/* KNOWLEDGE DETAILS MODAL */}
      {detailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-800 p-5 bg-slate-950">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Info className={`w-5 h-5 ${detailsModal.type === 'workout' ? 'text-indigo-400' : 'text-emerald-400'}`}/> 
                {detailsModal.type === 'workout' ? 'Exercise Details' : 'Meal Details'}
              </h2>
              <button onClick={() => setDetailsModal(null)} className="text-slate-500 hover:text-white"><X /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-white mb-2">{detailsModal.item.name || detailsModal.item.meal || detailsModal.item.exercise}</h3>
                {detailsModal.type === 'workout' ? (
                  <div className="flex flex-wrap gap-2 text-sm font-medium text-slate-300 mb-4">
                    <span className="bg-slate-800 px-3 py-1.5 rounded-lg">Prescribed: {detailsModal.item.sets} Sets × {detailsModal.item.reps} Reps</span>
                    <span className="bg-slate-800 px-3 py-1.5 rounded-lg">Rest: {detailsModal.item.rest_seconds || detailsModal.item.rest || '-'}s</span>
                  </div>
                ) : (
                  <div className="flex gap-3 text-sm font-bold mb-4">
                    <span className="bg-orange-500/10 text-orange-400 px-3 py-1.5 rounded-lg border border-orange-500/20">Est. Calories: {detailsModal.item.calories}</span>
                    <span className="bg-emerald-500/10 text-emerald-400 px-3 py-1.5 rounded-lg border border-emerald-500/20">Est. Protein: {detailsModal.item.protein_g}g</span>
                  </div>
                )}
              </div>

              {detailsModal.kbData ? (
                <div className="space-y-6">
                  {detailsModal.type === 'workout' ? (
                    <>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Instructions</h4>
                        <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-300">
                          {detailsModal.kbData.instructions.map((step: string, i: number) => <li key={i}>{step}</li>)}
                        </ol>
                      </div>
                      <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-xl">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-red-400 mb-2">Common Mistakes</h4>
                        <ul className="list-disc pl-5 space-y-1 text-sm text-red-200/80">
                          {detailsModal.kbData.common_mistakes.map((mistake: string, i: number) => <li key={i}>{mistake}</li>)}
                        </ul>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Preparation Instructions</h4>
                        <ol className="list-decimal pl-5 space-y-2 text-sm text-slate-300">
                          {detailsModal.kbData.prep_instructions.map((step: string, i: number) => <li key={i}>{step}</li>)}
                        </ol>
                      </div>
                      <div className="bg-emerald-950/20 border border-emerald-900/30 p-4 rounded-xl">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400 mb-2">Possible Substitutions</h4>
                        <ul className="list-disc pl-5 space-y-1 text-sm text-emerald-200/80">
                          {detailsModal.kbData.substitutions.map((sub: string, i: number) => <li key={i}>{sub}</li>)}
                        </ul>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl text-center text-slate-400 text-sm">
                  <p>Detailed instructions for this specific item are not currently available in the knowledge base.</p>
                  <p className="mt-2 text-xs text-slate-500">Note: {detailsModal.item.notes || detailsModal.item.ingredients || 'Follow standard form/preparation.'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
