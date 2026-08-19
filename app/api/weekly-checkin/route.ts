
import { auth } from '@clerk/nextjs';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// ============================================================
// Environment variables (set in .env.local)
// ============================================================
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

// ============================================================
// Supabase service role client (bypasses RLS)
// ============================================================
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// ============================================================
// Gemini AI client
// ============================================================
const genAI = new GoogleGenerativeAI(geminiApiKey);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' }); // or 'gemini-1.5-flash'

// ============================================================
// Request body validation schema (simple)
// ============================================================
interface CheckinRequest {
  weight_kg: number;
  workout_difficulty: 'Too Easy' | 'Just Right' | 'Too Hard';
  energy_rating: number; // 1-5
  user_notes?: string;
}

function validateRequest(body: any): CheckinRequest {
  const { weight_kg, workout_difficulty, energy_rating, user_notes } = body;
  if (typeof weight_kg !== 'number' || weight_kg <= 0) throw new Error('Invalid weight_kg');
  if (!['Too Easy', 'Just Right', 'Too Hard'].includes(workout_difficulty)) throw new Error('Invalid workout_difficulty');
  if (typeof energy_rating !== 'number' || energy_rating < 1 || energy_rating > 5) throw new Error('energy_rating must be 1-5');
  return { weight_kg, workout_difficulty, energy_rating, user_notes: user_notes || '' };
}

// ============================================================
// Helper: Count completed activities for the given week
// ============================================================
async function countCompletedActivities(userId: string, weekNumber: number) {
  // Workout activity
  const { count: workoutCount, error: wErr } = await supabase
    .from('workout_activity')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('week_number', weekNumber)
    .eq('completed', true);

  if (wErr) throw new Error(`Failed to fetch workout_activity: ${wErr.message}`);

  // Diet activity
  const { count: dietCount, error: dErr } = await supabase
    .from('diet_activity')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('week_number', weekNumber)
    .eq('completed', true);

  if (dErr) throw new Error(`Failed to fetch diet_activity: ${dErr.message}`);

  return {
    workouts_completed: workoutCount || 0,
    diet_completed: dietCount || 0,
  };
}

// ============================================================
// Main POST handler
// ============================================================
export async function POST(req: Request) {
  try {
    // 1. Authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate request body
    const body = await req.json();
    let checkinData: CheckinRequest;
    try {
      checkinData = validateRequest(body);
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // 3. Fetch user profile and current active plans
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('clerk_user_id', userId) // or 'id' if using UUID; adjust as needed
      .single();

    if (profileErr || !profile) {
      console.error('Profile fetch error:', profileErr);
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // Fetch active workout plan
    const { data: workoutPlan, error: wpErr } = await supabase
      .from('workout_plans')
      .select('*')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .single();

    if (wpErr || !workoutPlan) {
      console.error('Workout plan error:', wpErr);
      return NextResponse.json({ error: 'No active workout plan' }, { status: 404 });
    }

    // Fetch active diet plan
    const { data: dietPlan, error: dpErr } = await supabase
      .from('diet_plans')
      .select('*')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .single();

    if (dpErr || !dietPlan) {
      console.error('Diet plan error:', dpErr);
      return NextResponse.json({ error: 'No active diet plan' }, { status: 404 });
    }

    // 4. Count completed activities for current week
    const currentWeek = workoutPlan.week_number; // assumes both plans have same week_number
    const { workouts_completed, diet_completed } = await countCompletedActivities(profile.id, currentWeek);

    // 5. Build Gemini prompt
    const prompt = buildGeminiPrompt({
      profile,
      workoutPlan,
      dietPlan,
      currentWeek,
      workouts_completed,
      diet_completed,
      feedback: {
        weight_kg: checkinData.weight_kg,
        workout_difficulty: checkinData.workout_difficulty,
        energy_rating: checkinData.energy_rating,
        user_notes: checkinData.user_notes,
      },
    });

    // 6. Call Gemini and parse response
    const geminiResponse = await model.generateContent(prompt);
    const responseText = geminiResponse.response.text();
    let aiOutput;
    try {
      // Extract JSON from response (may contain markdown fences)
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/(\{[\s\S]*\})/);
      const jsonStr = jsonMatch ? jsonMatch[1] : responseText;
      aiOutput = JSON.parse(jsonStr);
    } catch (err) {
      console.error('Failed to parse Gemini response:', responseText);
      return NextResponse.json({ error: 'Invalid AI response format' }, { status: 502 });
    }

    // Validate expected structure
    if (!aiOutput.ai_analysis || !aiOutput.workout || !aiOutput.diet) {
      console.error('Gemini response missing required fields:', aiOutput);
      return NextResponse.json({ error: 'AI response missing required fields' }, { status: 502 });
    }

    // 7. Save check-in and generate new plans using a transaction (via RPC)
    const newWeek = currentWeek + 1;
    const { data: txResult, error: txErr } = await supabase.rpc('generate_new_week_plans', {
      p_user_id: profile.id,
      p_week_number: currentWeek, // the week we are checking in
      p_weight_kg: checkinData.weight_kg,
      p_workout_difficulty: checkinData.workout_difficulty,
      p_energy_rating: checkinData.energy_rating,
      p_workouts_completed: workouts_completed,
      p_diet_completed: diet_completed,
      p_user_notes: checkinData.user_notes || '',
      p_ai_analysis: aiOutput.ai_analysis,
      p_new_workout: aiOutput.workout,
      p_new_diet: aiOutput.diet,
    });

    if (txErr) {
      console.error('Transaction failed:', txErr);
      return NextResponse.json({ error: 'Database transaction failed' }, { status: 500 });
    }

    // 8. Return success response
    return NextResponse.json({
      success: true,
      week_number: newWeek,
      ai_analysis: aiOutput.ai_analysis,
      workout: aiOutput.workout,
      diet: aiOutput.diet,
    });

  } catch (error: any) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// Helper: Build the Gemini prompt
// ============================================================
function buildGeminiPrompt(params: {
  profile: any;
  workoutPlan: any;
  dietPlan: any;
  currentWeek: number;
  workouts_completed: number;
  diet_completed: number;
  feedback: {
    weight_kg: number;
    workout_difficulty: string;
    energy_rating: number;
    user_notes?: string;
  };
}) {
  const { profile, workoutPlan, dietPlan, currentWeek, workouts_completed, diet_completed, feedback } = params;

  // Extract baseline info (assume these fields exist in profiles)
  const { age, height_cm, initial_weight_kg, goal, equipment, diet_preference, budget } = profile;

  // Previous week plans (just the structure)
  const prevWorkout = workoutPlan.plan_data; // JSONB
  const prevDiet = dietPlan.plan_data; // JSONB

  // Adherence
  const totalDays = 7; // assume 7-day week
  const workoutAdherence = `${workouts_completed}/${totalDays}`;
  const dietAdherence = `${diet_completed}/${totalDays}`;

  return `
You are an expert fitness and nutrition coach. Based on the user's baseline, previous week's plan, actual adherence, and feedback, generate a new personalized workout and diet plan for the **next week** (Week ${currentWeek + 1}).

**User Baseline:**
- Age: ${age}
- Height: ${height_cm} cm
- Initial Weight: ${initial_weight_kg} kg
- Goal: ${goal} (e.g., Muscle Gain, Fat Loss, Maintenance)
- Available Equipment: ${equipment}
- Diet Preference: ${diet_preference}
- Budget: ${budget}

**Previous Week Plan (Week ${currentWeek}):**
Workout Plan (JSON):
${JSON.stringify(prevWorkout, null, 2)}

Diet Plan (JSON):
${JSON.stringify(prevDiet, null, 2)}

**Actual Execution (Week ${currentWeek}):**
- Workout days completed: ${workoutAdherence}
- Diet days completed: ${dietAdherence}

**User Feedback:**
- New Weight: ${feedback.weight_kg} kg
- Workout Difficulty: ${feedback.workout_difficulty} ('Too Easy', 'Just Right', 'Too Hard')
- Energy Rating: ${feedback.energy_rating} (1-5, 1=lowest)
- User Notes: ${feedback.user_notes || 'None'}

**Coaching Logic to Apply:**
- If goal is Muscle Gain and weight did not increase (or increased less than expected), increase daily calories by +200-300 kcal.
- If goal is Fat Loss and weight is stagnant, decrease calories by -150-200 kcal or add cardio sessions.
- If workout_difficulty is 'Too Easy', apply progressive overload (increase sets, use harder exercise variations, adjust rep ranges).
- If workout_difficulty is 'Too Hard' or energy_rating < 3, reduce volume, add more recovery days, or lower intensity.
- Ensure plans are realistic and safe given the user's equipment and preferences.

**Output Format:**
Return ONLY a valid JSON object with the following structure (no extra text, no markdown fences):
{
  "ai_analysis": "3-4 sentence detailed feedback explaining what worked, what changed for next week, and coach motivation.",
  "workout": {
    "Monday": { "focus": "", "duration_minutes": 0, "exercises": [{ "name": "", "sets": 3, "reps": "8-12", "rest_seconds": 60, "notes": "" }] },
    "Tuesday": { ... },
    "Wednesday": { ... },
    "Thursday": { ... },
    "Friday": { ... },
    "Saturday": { ... },
    "Sunday": { ... }
  },
  "diet": {
    "Monday": { "breakfast": { "meal": "", "calories": 0, "protein_g": 0 }, "lunch": {...}, "dinner": {...}, "snacks": [{ "name": "", "calories": 0, "protein_g": 0 }], "daily_total_calories": 0, "daily_total_protein_g": 0 },
    ... (all days)
  }
}

Generate the new plan accordingly.
`;
}

/*
============================================================
SQL function required for atomic transaction
Run this in your Supabase SQL Editor before using the API:
============================================================
CREATE OR REPLACE FUNCTION generate_new_week_plans(
  p_user_id UUID,
  p_week_number INTEGER,
  p_weight_kg NUMERIC,
  p_workout_difficulty TEXT,
  p_energy_rating INTEGER,
  p_workouts_completed INTEGER,
  p_diet_completed INTEGER,
  p_user_notes TEXT,
  p_ai_analysis TEXT,
  p_new_workout JSONB,
  p_new_diet JSONB
) RETURNS INTEGER AS $$
DECLARE
  new_week INTEGER;
BEGIN
  -- Insert weekly check-in
  INSERT INTO weekly_checkins (
    user_id, week_number, weight_kg, workout_difficulty, energy_rating,
    workouts_completed_count, diet_completed_count, user_notes, ai_analysis
  ) VALUES (
    p_user_id, p_week_number, p_weight_kg, p_workout_difficulty, p_energy_rating,
    p_workouts_completed, p_diet_completed, p_user_notes, p_ai_analysis
  );

  -- Deactivate old plans
  UPDATE workout_plans SET is_active = false WHERE user_id = p_user_id AND is_active = true;
  UPDATE diet_plans SET is_active = false WHERE user_id = p_user_id AND is_active = true;

  -- Insert new plans with next week number
  new_week := p_week_number + 1;
  INSERT INTO workout_plans (user_id, week_number, plan_data, is_active, created_at)
  VALUES (p_user_id, new_week, p_new_workout, true, now());

  INSERT INTO diet_plans (user_id, week_number, plan_data, is_active, created_at)
  VALUES (p_user_id, new_week, p_new_diet, true, now());

  RETURN new_week;
END;
$$ LANGUAGE plpgsql;
*/
