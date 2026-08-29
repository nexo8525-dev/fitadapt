'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Loader2, ArrowLeft, Save, AlertTriangle, RefreshCw, Settings, UserCircle, Dumbbell, Utensils } from 'lucide-react';

export default function SettingsPage() {
  const { user, isLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenWarning, setRegenWarning] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });

  const [formData, setFormData] = useState({
    fitness_goal: '',
    experience_level: '',
    workout_location: '',
    equipment: '',
    training_days: '',
    time_per_session_min: '',
    dietary_preference: '',
    available_foods: '',
    disliked_foods: '',
  });

  useEffect(() => {
    if (!isLoaded || !user) return;
    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/profile');
        const json = await res.json();
        if (json.success) {
          setFormData({
            fitness_goal: json.profile.fitness_goal || '',
            experience_level: json.profile.experience_level || '',
            workout_location: json.profile.workout_location || '',
            equipment: json.profile.equipment || '',
            training_days: String(json.profile.training_days || ''),
            time_per_session_min: String(json.profile.time_per_session_min || ''),
            dietary_preference: json.profile.dietary_preference || '',
            available_foods: json.profile.available_foods || '',
            disliked_foods: json.profile.disliked_foods || '',
          });
        }
      } catch (err) {
        console.error('Failed to fetch profile');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [isLoaded, user]);

  const handleChange = (e: any) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setMessage({ text: 'Profile updated! Changes will apply to your NEXT weekly plan.', type: 'success' });
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setMessage({ text: '', type: '' });
    
    try {
      const res = await fetch('/api/genrate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate plan');
      
      setMessage({ text: 'New plan generated successfully!', type: 'success' });
      setRegenWarning(false);
      
      // Redirect to dashboard after a short delay
      setTimeout(() => window.location.href = '/dashboard', 2000);
    } catch (err: any) {
      setMessage({ text: err.message, type: 'error' });
    } finally {
      setRegenerating(false);
    }
  };

  if (!isLoaded || loading) return <div className="min-h-screen bg-slate-950 flex justify-center items-center"><Loader2 className="animate-spin text-indigo-500 w-8 h-8"/></div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16">
      <header className="border-b border-slate-800 bg-slate-950/90 pt-8 pb-6 px-6 md:px-8">
        <div className="mx-auto max-w-3xl">
          <button onClick={() => window.location.href = '/dashboard'} className="flex items-center gap-2 text-slate-400 hover:text-white mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </button>
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-indigo-400" />
            <h1 className="text-3xl font-bold tracking-tight text-white">Profile Settings</h1>
          </div>
          <p className="text-slate-400 mt-2 text-sm">Update your preferences. Changes will safely apply to future plans.</p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 md:px-8 space-y-8">
        
        {message.text && (
          <div className={`p-4 rounded-xl border ${message.type === 'success' ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400' : 'bg-red-950/30 border-red-500/30 text-red-400'}`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          
          {/* Workout Preferences */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><Dumbbell className="w-5 h-5 text-indigo-400"/> Workout Preferences</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Fitness Goal</label>
                <select name="fitness_goal" value={formData.fitness_goal} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                  <option>Muscle Gain</option><option>Fat Loss</option><option>General Fitness</option><option>Strength</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Experience Level</label>
                <select name="experience_level" value={formData.experience_level} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                  <option>Beginner</option><option>Intermediate</option><option>Advanced</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Workout Location</label>
                <select name="workout_location" value={formData.workout_location} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                  <option>Home</option><option>Gym</option><option>Both</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Available Equipment</label>
                <select name="equipment" value={formData.equipment} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white">
                  <option>No Equipment</option><option>Dumbbells</option><option>Pull-up Bar</option><option>Resistance Bands</option><option>Barbell</option><option>Full Gym</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Training Days (Per Week)</label>
                <input type="number" name="training_days" value={formData.training_days} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Max Time per Session (Mins)</label>
                <input type="number" name="time_per_session_min" value={formData.time_per_session_min} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" />
              </div>
            </div>
          </div>

          {/* Diet Preferences */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><Utensils className="w-5 h-5 text-emerald-400"/> Diet Preferences</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Dietary Preference</label>
                <select name="dietary_preference" value={formData.dietary_preference} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white md:w-1/2">
                  <option>Vegetarian</option><option>Non-Vegetarian</option><option>Vegan</option><option>Keto</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Available Foods (Comma separated)</label>
                <textarea name="available_foods" value={formData.available_foods} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" rows={2}></textarea>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-400 mb-1 block">Foods to Avoid (Comma separated)</label>
                <textarea name="disliked_foods" value={formData.disliked_foods} onChange={handleChange} className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white" rows={2}></textarea>
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3.5 rounded-xl transition-all flex justify-center items-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Save Preferences
          </button>
        </form>

        {/* Danger Zone: Explicit Regeneration Control */}
        <section className="bg-red-950/20 border border-red-900/50 rounded-2xl p-6 mt-12">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 text-red-500 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-white">Danger Zone: Regenerate Plan</h2>
              <p className="text-sm text-slate-400 mt-1 mb-4">
                Did your schedule completely change? You can ask the AI to regenerate your plan immediately. 
                <strong> This will mark your current active plan as historical and create a brand new one.</strong>
              </p>
              
              {!regenWarning ? (
                <button onClick={() => setRegenWarning(true)} className="bg-slate-900 border border-red-900/50 text-red-400 hover:bg-red-900/50 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                  Regenerate Current Plan
                </button>
              ) : (
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
                  <p className="text-sm text-slate-300 mb-3">Are you sure? Your current active week will be archived.</p>
                  <div className="flex gap-3">
                    <button disabled={regenerating} onClick={handleRegenerate} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2">
                      {regenerating ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>} Yes, Regenerate
                    </button>
                    <button disabled={regenerating} onClick={() => setRegenWarning(false)} className="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-bold">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
