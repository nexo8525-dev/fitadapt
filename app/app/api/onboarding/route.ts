import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // Clerk se user verify
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Form data parse
    const body = await req.json();

    // Profile data prepare (sab fields ko sahi type mein convert)
    const profileData = {
      id: userId,
      clerk_user_id: userId,
      full_name: body.full_name,
      age: parseInt(body.age),
      gender: body.gender,
      height_cm: parseFloat(body.height_cm),
      weight_kg: parseFloat(body.weight_kg),
      fitness_goal: body.fitness_goal,
      experience_level: body.experience_level,
      workout_location: body.workout_location,
      equipment: body.equipment,
      training_days: parseInt(body.training_days),
      time_per_session_min: parseInt(body.time_per_session_min),
      pushup_capacity: parseInt(body.pushup_capacity),
      dietary_preference: body.dietary_preference,
      available_foods: body.available_foods,
      disliked_foods: body.disliked_foods,
      diet_budget_per_month: parseFloat(body.diet_budget_per_month),
    };

    // Supabase Admin (Service Role) se insert
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
