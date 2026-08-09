'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { LogOut, Sparkles, Utensils, Calendar } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

      setProfile(data);
      setLoading(false);
    };

    fetchProfile();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex justify-center items-center">
        <p className="text-sm text-slate-400">Loading Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 max-w-md mx-auto pb-20">
      <div className="flex justify-between items-center py-4 mb-4 border-b border-slate-800">
        <div>
          <h1 className="text-xl font-bold text-slate-100">
            Welcome, {profile?.full_name || 'Athlete'}!
          </h1>
          <p className="text-xs text-slate-400 uppercase tracking-wider">
            {profile?.fitness_goal?.replace('_', ' ')} • {profile?.workout_location}
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="p-2 bg-slate-900 border border-slate-800 text-slate-400 rounded-xl"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <Calendar className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-xs text-slate-400">Workout Schedule</p>
          <p className="text-sm font-bold text-slate-200">{profile?.training_days} Days / Week</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
          <Utensils className="w-5 h-5 text-emerald-400 mb-2" />
          <p className="text-xs text-slate-400">Diet Style</p>
          <p className="text-sm font-bold text-slate-200 capitalize">{profile?.dietary_preference}</p>
        </div>
      </div>

      <div className="bg-gradient-to-br from-emerald-950 to-slate-900 border border-emerald-500/30 p-5 rounded-2xl mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <h2 className="text-base font-bold text-emerald-400">Adaptive AI Engine</h2>
        </div>
        <p className="text-xs text-slate-300 mb-4">
          Ready to generate your custom Week 1 Workout & Diet plan based on your exact profile.
        </p>
        <button
          onClick={() => alert("Next step: Gemini AI integration!")}
          className="w-full py-3 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex justify-center items-center gap-2"
        >
          Generate My Plan
        </button>
      </div>
    </div>
  );
}
