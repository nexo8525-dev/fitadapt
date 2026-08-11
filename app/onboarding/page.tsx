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
    gender: 'Male',
    height_cm: '',
    weight_kg: '',
    fitness_goal: 'Muscle Gain',
    experience_level: 'Beginner',
    workout_location: 'Home',
    equipment: 'Dumbbells',
    training_days: '3',
    time_per_session_min: '30',
    pushup_capacity: '10',
    dietary_preference: 'Vegetarian',
    available_foods: '',
    disliked_foods: '',
    diet_budget_per_month: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (response.ok) {
        router.push('/dashboard');
      } else {
        alert(result.error || 'Something went wrong.');
      }
    } catch (error) {
      alert('Network error. Check console.');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Complete Setup</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic Info */}
        <div>
          <label className="block font-medium">Full Name</label>
          <input
            type="text"
            name="full_name"
            value={formData.full_name}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Age</label>
          <input
            type="number"
            name="age"
            value={formData.age}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Gender</label>
          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            className="w-full border p-2 rounded"
          >
            <option>Male</option>
            <option>Female</option>
            <option>Other</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">Height (cm)</label>
          <input
            type="number"
            name="height_cm"
            value={formData.height_cm}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Weight (kg)</label>
          <input
            type="number"
            name="weight_kg"
            value={formData.weight_kg}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Fitness Goal</label>
          <select
            name="fitness_goal"
            value={formData.fitness_goal}
            onChange={handleChange}
            className="w-full border p-2 rounded"
          >
            <option>Muscle Gain</option>
            <option>Fat Loss</option>
            <option>General Fitness</option>
            <option>Strength</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">Experience Level</label>
          <select
            name="experience_level"
            value={formData.experience_level}
            onChange={handleChange}
            className="w-full border p-2 rounded"
          >
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">Workout Location</label>
          <select
            name="workout_location"
            value={formData.workout_location}
            onChange={handleChange}
            className="w-full border p-2 rounded"
          >
            <option>Home</option>
            <option>Gym</option>
            <option>Both</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">Equipment Available</label>
          <select
            name="equipment"
            value={formData.equipment}
            onChange={handleChange}
            className="w-full border p-2 rounded"
          >
            <option>No Equipment</option>
            <option>Dumbbells</option>
            <option>Pull-up Bar</option>
            <option>Resistance Bands</option>
            <option>Barbell</option>
            <option>Full Gym</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">Training Days Per Week</label>
          <input
            type="number"
            name="training_days"
            value={formData.training_days}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Time Per Session (minutes)</label>
          <input
            type="number"
            name="time_per_session_min"
            value={formData.time_per_session_min}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Max Pushups You Can Do</label>
          <input
            type="number"
            name="pushup_capacity"
            value={formData.pushup_capacity}
            onChange={handleChange}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block font-medium">Diet Preference</label>
          <select
            name="dietary_preference"
            value={formData.dietary_preference}
            onChange={handleChange}
            className="w-full border p-2 rounded"
          >
            <option>Vegetarian</option>
            <option>Non-Vegetarian</option>
            <option>Vegan</option>
            <option>Keto</option>
          </select>
        </div>

        <div>
          <label className="block font-medium">Foods Available (comma separated)</label>
          <input
            type="text"
            name="available_foods"
            value={formData.available_foods}
            onChange={handleChange}
            placeholder="rice, dal, paneer, chicken, eggs"
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label className="block font-medium">Foods to Avoid (comma separated)</label>
          <input
            type="text"
            name="disliked_foods"
            value={formData.disliked_foods}
            onChange={handleChange}
            placeholder="bitter gourd, mushroom"
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label className="block font-medium">Monthly Diet Budget (₹)</label>
          <input
            type="number"
            name="diet_budget_per_month"
            value={formData.diet_budget_per_month}
            onChange={handleChange}
            className="w-full border p-2 rounded"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
        >
          {loading ? 'Saving...' : 'Complete Setup'}
        </button>
      </form>
    </div>
  );
          }
