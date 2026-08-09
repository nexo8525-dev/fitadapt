'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Dumbbell, ArrowRight, ArrowLeft, Check, Loader2 } from 'lucide-react';

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [formData, setFormData] = useState({
    full_name: '',
    age: 25,
    gender: 'male',
    height_cm: 175,
    weight_kg: 70,
    fitness_goal: 'muscle_gain',
    experience_level: 'beginner',
    workout_location: 'home',
    equipment: [] as string[],
    training_days: 4,
    time_per_session_min: 45,
    pushup_capacity: 10,
    dietary_preference: 'veg',
    available_foods: 'rice, dal, paneer, oats, milk, bananas',
    disliked_foods: 'bitter gourd',
    diet_budget_per_month: 3000,
  });

  const toggleEquipment = (item: string) => {
    setFormData((prev) => {
      const exists = prev.equipment.includes(item);
      if (exists) {
        return { ...prev, equipment: prev.equipment.filter((i) => i !== item) };
      } else {
        return { ...prev, equipment: [...prev.equipment, item] };
      }
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated.');

      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        ...formData,
      });

      if (error) throw error;
      router.push('/dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center px-4 py-8">
      <div className="max-w-md mx-auto w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-emerald-500 p-2 rounded-xl text-slate-950">
            <Dumbbell className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">FitAdapt Setup</h1>
            <p className="text-xs text-slate-400">Step {step} of 4</p>
          </div>
        </div>

        <div className="w-full bg-slate-800 h-1.5 rounded-full mb-8 overflow-hidden">
          <div
            className="bg-emerald-500 h-full transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl">
          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl text-xs mb-4">
              {errorMsg}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-100">Basic Info</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Full Name</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Age</label>
                  <input
                    type="number"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Gender</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Height (cm)</label>
                  <input
                    type="number"
                    value={formData.height_cm}
                    onChange={(e) => setFormData({ ...formData, height_cm: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Weight (kg)</label>
                  <input
                    type="number"
                    value={formData.weight_kg}
                    onChange={(e) => setFormData({ ...formData, weight_kg: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-100">Goals & Experience</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Primary Fitness Goal</label>
                <select
                  value={formData.fitness_goal}
                  onChange={(e) => setFormData({ ...formData, fitness_goal: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                >
                  <option value="muscle_gain">Muscle Gain</option>
                  <option value="fat_loss">Fat Loss</option>
                  <option value="strength">Strength Building</option>
                  <option value="general_fitness">General Fitness</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Current Experience</label>
                <select
                  value={formData.experience_level}
                  onChange={(e) => setFormData({ ...formData, experience_level: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                >
                  <option value="beginner">Beginner (0 - 6 months)</option>
                  <option value="intermediate">Intermediate (6 months - 2 yrs)</option>
                  <option value="advanced">Advanced (2+ yrs)</option>
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-100">Workout Environment</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Training Location</label>
                <select
                  value={formData.workout_location}
                  onChange={(e) => setFormData({ ...formData, workout_location: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                >
                  <option value="home">Home</option>
                  <option value="gym">Gym</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Available Equipment</label>
                <div className="grid grid-cols-2 gap-2">
                  {['No Equipment', 'Dumbbells', 'Pull-up Bar', 'Resistance Bands', 'Full Gym'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleEquipment(item)}
                      className={`p-2.5 rounded-xl text-xs font-medium border text-left flex justify-between items-center ${
                        formData.equipment.includes(item)
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span>{item}</span>
                      {formData.equipment.includes(item) && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Days / Week</label>
                  <input
                    type="number"
                    min="1"
                    max="7"
                    value={formData.training_days}
                    onChange={(e) => setFormData({ ...formData, training_days: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Push-up Capacity</label>
                  <input
                    type="number"
                    value={formData.pushup_capacity}
                    onChange={(e) => setFormData({ ...formData, pushup_capacity: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-slate-100">Dietary Profile</h2>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Diet Preference</label>
                <select
                  value={formData.dietary_preference}
                  onChange={(e) => setFormData({ ...formData, dietary_preference: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                >
                  <option value="veg">Vegetarian</option>
                  <option value="non_veg">Non-Vegetarian</option>
                  <option value="eggetarian">Eggetarian</option>
                  <option value="vegan">Vegan</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Foods Easily Available</label>
                <textarea
                  rows={2}
                  value={formData.available_foods}
                  onChange={(e) => setFormData({ ...formData, available_foods: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none resize-none"
                  placeholder="e.g. Rice, Oats, Paneer, Chicken, Eggs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Foods You Dislike / Avoid</label>
                <input
                  type="text"
                  value={formData.disliked_foods}
                  onChange={(e) => setFormData({ ...formData, disliked_foods: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                />
              </div>
            </div>
          )}

          <div className="mt-8 flex justify-between gap-3">
            {step > 1 ? (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="px-4 py-3 bg-slate-800 text-slate-300 font-semibold rounded-xl text-xs flex items-center gap-1"
              >
                <ArrowLeft className="w-4 h-4" /> Back
              </button>
            ) : <div />}

            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="px-6 py-3 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1"
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                disabled={loading}
                onClick={handleSubmit}
                className="px-6 py-3 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Complete Setup'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
  }
