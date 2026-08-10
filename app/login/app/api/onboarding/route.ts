import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Service role key sirf server-side use hoti hai, RLS bypass karti hai
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // 1. Clerk se user verify karo
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Body parse karo (frontend se aayi form data)
    const body = await req.json();

    // 3. Profile data prepare karo
    const profileData = {
      id: userId, // Clerk ID ko primary key banayenge
      clerk_user_id: userId, // backup ke liye
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

    // 4. Supabase Admin client (Service Role) se DB mein daalo
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
