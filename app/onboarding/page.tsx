'use client';

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
    
      
        
          
            
          
          
            FitAdapt Setup
            Step {step} of 4
          
        

        
          
        

        
          {errorMsg && (
            
              {errorMsg}
            
          )}

          {step === 1 && (
            
              Basic Info
              
                Full Name
                 setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Rahul Sharma"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                />
              
              
                
                  Age
                   setFormData({ ...formData, age: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                
                
                  Gender
                   setFormData({ ...formData, gender: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  >
                    Male
                    Female
                    Other
                  
                
              
              
                
                  Height (cm)
                   setFormData({ ...formData, height_cm: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                
                
                  Weight (kg)
                   setFormData({ ...formData, weight_kg: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                
              
            
          )}

          {step === 2 && (
            
              Goals & Experience
              
                Primary Fitness Goal
                 setFormData({ ...formData, fitness_goal: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                >
                  Muscle Gain
                  Fat Loss
                  Strength Building
                  General Fitness
                
              
              
                Current Experience
                 setFormData({ ...formData, experience_level: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                >
                  Beginner (0 - 6 months)
                  Intermediate (6 months - 2 yrs)
                  Advanced (2+ yrs)
                
              
            
          )}

          {step === 3 && (
            
              Workout Environment
              
                Training Location
                 setFormData({ ...formData, workout_location: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                >
                  Home
                  Gym
                  Both
                
              
              
                Available Equipment
                
                  {['No Equipment', 'Dumbbells', 'Pull-up Bar', 'Resistance Bands', 'Full Gym'].map((item) => (
                     toggleEquipment(item)}
                      className={`p-2.5 rounded-xl text-xs font-medium border text-left flex justify-between items-center ${
                        formData.equipment.includes(item)
                          ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      {item}
                      {formData.equipment.includes(item) && }
                    
                  ))}
                
              
              
                
                  Days / Week
                   setFormData({ ...formData, training_days: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                
                
                  Push-up Capacity
                   setFormData({ ...formData, pushup_capacity: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                  />
                
              
            
          )}

          {step === 4 && (
            
              Dietary Profile
              
                Diet Preference
                 setFormData({ ...formData, dietary_preference: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm focus:border-emerald-500 outline-none"
                >
                  Vegetarian
                  Non-Vegetarian
                  Eggetarian
                  Vegan
                
              
              
                Foods Easily Available
                 setFormData({ ...formData, available_foods: e.target.value })}
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
                  placeholder="e.g. Fish, Karela"
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
