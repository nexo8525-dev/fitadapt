'use client';

export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Dumbbell, Lock, Mail, ArrowRight, Loader2 } from 'lucide-react';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single();

          if (profile) {
            router.push('/dashboard');
          } else {
            router.push('/onboarding');
          }
        }
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
        router.push('/onboarding');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    
      
        
          
            
          
        
        
          {"FitAdapt AI"}
        
        
          {isLogin ? 'Sign in to your adaptive coach.' : 'Start your personalized fitness journey.'}
        
      

      
        
          
            {errorMsg && (
              
                {errorMsg}
              
            )}

            
              
                {"Email"}
              
              
                
                 setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-sm"
                  placeholder="you@example.com"
                />
              
            

            
              
                {"Password"}
              
              
                
                 setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 text-sm"
                  placeholder="••••••••"
                />
              
            

            
              {loading ? (
                
              ) : (
                <>
                  {isLogin ? 'Sign In' : 'Create Account'}
                  
                
              )}
            
          

          
             {
                setIsLogin(!isLogin);
                setErrorMsg('');
              }}
              className="text-xs text-slate-400 hover:text-emerald-400"
            >
              {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            
          
        
      
    
  );
}
