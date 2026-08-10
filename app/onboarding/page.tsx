'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      alert('User not loaded. Please try again.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        router.push('/dashboard');
      } else {
        alert(result.error || 'Something went wrong. Please try again.');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Yahan tumhara existing form JSX rahega
  return (
    <form onSubmit={handleSubmit}>
      {/* Tumhare saare input fields yahan */}
      <button type="submit" disabled={loading}>
        {loading ? 'Saving...' : 'Complete Setup'}
      </button>
    </form>
  );
}
