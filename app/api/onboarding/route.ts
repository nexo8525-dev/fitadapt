import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

// Environment variables - CHECK KARO LOGS MEIN
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('=== ONBOARDING API LOADED ===');
console.log('SUPABASE_URL exists?', !!supabaseUrl);
console.log('SERVICE_KEY exists?', !!supabaseServiceKey);

export async function POST(req: NextRequest) {
  console.log('=== ONBOARDING API CALLED ===');
  
  try {
    // 1. Clerk verify
    console.log('Step 1: Verifying Clerk user...');
    const { userId } = await auth();
    console.log('Clerk userId:', userId);
    
    if (!userId) {
      console.log('❌ No userId from Clerk');
      return NextResponse.json(
        { error: 'Unauthorized - No userId' },
        { status: 401 }
      );
    }

    // 2. Parse body
    console.log('Step 2: Parsing request body...');
    const body = await req.json();
    console.log('Received body keys:', Object.keys(body));
    console.log('Sample: full_name=', body.full_name, 'age=', body.age);

    // 3. Check environment variables
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 4. Prepare profile data (SAARE FIELDS - carefully mapped)
    console.log('Step 3: Preparing profile data...');
    const profileData = {
      id: userId,
      clerk_user_id: userId,
      full_name: body.full_name || '',
      age: parseInt(body.age) || 0,
      gender: body.gender || '',
      height_cm: parseFloat(body.height_cm) || 0,
      weight_kg: parseFloat(body.weight_kg) || 0, // ✅ FIXED: weight_kg
      fitness_goal: body.fitness_goal || '',
      experience_level: body.experience_level || '',
      workout_location: body.workout_location || '',
      equipment: body.equipment || '',
      training_days: parseInt(body.training_days) || 0,
      time_per_session_min: parseInt(body.time_per_session_min) || 0,
      pushup_capacity: parseInt(body.pushup_capacity) || 0,
      dietary_preference: body.dietary_preference || '',
      available_foods: body.available_foods || '',
      disliked_foods: body.disliked_foods || '',
      diet_budget_per_month: parseFloat(body.diet_budget_per_month) || 0,
    };
    console.log('Profile data prepared:', JSON.stringify(profileData, null, 2));

    // 5. Supabase Admin client
    console.log('Step 4: Creating Supabase admin client...');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 6. Upsert profile
    console.log('Step 5: Upserting profile to Supabase...');
    const { error } = await supabaseAdmin
      .from('profiles')
      .upsert(profileData, { onConflict: 'id' });

    if (error) {
      console.error('❌ Supabase upsert error:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        { error: `Database error: ${error.message}` },
        { status: 500 }
      );
    }

    console.log('✅ Profile upsert successful!');
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ UNHANDLED ERROR:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
      }
