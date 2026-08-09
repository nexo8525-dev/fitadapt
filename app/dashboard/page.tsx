'use client';

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { LogOut, Sparkles, Utensils, Calendar } from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
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
      
        {"Loading Dashboard..."}
      
    );
  }

  return (
    
      
        
          
            {`Welcome, ${profile?.full_name || 'Athlete'}!`}
          
          
            {`${profile?.fitness_goal ? profile.fitness_goal.replace('_', ' ') : 'FITNESS'} • ${profile?.workout_location || 'LOCATION'}`}
          
        
        
          
        
      

      
        
          
          {"Workout Schedule"}
          {`${profile?.training_days || 0} Days / Week`}
        
        
          
          {"Diet Style"}
          {profile?.dietary_preference || 'Balanced'}
        
      

      
        
          
          {"Adaptive AI Engine"}
        
        
          {"Ready to generate your custom Week 1 Workout & Diet plan based on your exact profile."}
        
         alert("Next step: Gemini AI integration!")}
          className="w-full py-3 bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs flex justify-center items-center gap-2"
        >
          {"Generate My Plan"}
        
      
    
  );
}
