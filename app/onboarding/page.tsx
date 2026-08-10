'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { supabase } from '@/lib/supabaseClient';

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [formData, setFormData] = useState({
    full_name: '',
    age: '',
    gender: '',
    height_cm: '',
    weight_kg: '',
    fitness_goal: '',
    experience_level: '',
    workout_location: '',
    equipment: '',
    training_days: '',
    time_per_session_min: '',
    pushup_capacity: '',
    dietary_preference: '',
    available_foods: '',
    disliked_foods: '',
    diet_budget_per_month: '',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    const payload = {
      id: user.id, // Clerk ID ko primary key banayenge
      clerk_user_id: user.id, // backup column
      ...formData,
      age: parseInt(formData.age),
      height_cm: parseFloat(formData.height_cm),
      weight_kg: parseFloat(formData.weight_kg),
      training_days: parseInt(formData.training_days),
      time_per_session_min: parseInt(formData.time_per_session_min),
      pushup_capacity: parseInt(formData.pushup_capacity),
      diet_budget_per_month: parseFloat(formData.diet_budget_per_month),
    };

    const { error } = await supabase.from('profiles').upsert(payload);
    setLoading(false);

    if (error) {
      console.error('Error saving profile:', error);
      alert('Something went wrong. Please try again.');
    } else {
      router.push('/dashboard');
    }
  };

  // Yahan tumhara existing form JSX rahega - bas handleSubmit ko attach karo
  return (
    <form onSubmit={handleSubmit}>
      {/* Tumhare saare input fields yahan */}
      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Complete Onboarding'}
      </button>
    </form>
  );
        }
