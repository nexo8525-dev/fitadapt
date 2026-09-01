import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// ENVIRONMENT & SETUP
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const genAI = new GoogleGenerativeAI(geminiApiKey);

type WorkoutDifficulty = 'Too Easy' | 'Just Right' | 'Too Hard';

interface CheckinRequest {
  weight_kg: number;
  workout_difficulty: WorkoutDifficulty;
  energy_rating: number;
  user_notes?: string;
}

const GEMINI_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

// ============================================================
// HELPERS
// ============================================================

function sleep(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function isRetryableGeminiError(error: any) {
  const message = String(error?.message || error || '').toLowerCase();
  return (message.includes('503') || message.includes('429') || message.includes('quota') || message.includes('exhausted'));
}

// ============================================================
// FETCH RICH WEEKLY ACTIVITY DATA
// ============================================================

async function fetchWeeklyActivities(userId: string, weekNumber: number) {
  const { data: workouts, error: wError } = await supabase
    .from('workout_activity')
    .select('*')
    .eq('user_id', userId)
    .eq('week_number', weekNumber);

  const { data: diets, error: dError } = await supabase
    .from('diet_activity')
    .select('*')
    .eq('user_id', userId)
    .eq('week_number', weekNumber);

  if (wError) throw new Error(`Workout activity error: ${wError.message}`);
  if (dError) throw new Error(`Diet activity error: ${dError.message}`);

  // Format data clearly for the AI to understand Prescribed vs Actual
  const formattedWorkouts = (workouts || []).map(w => ({
    day: w.day,
    completed: w.completed,
    execution: w.tracking_data?.exercises || [], // Contains prescribed vs actual sets/reps
    feedback: w.tracking_data?.feedback || {}    // Contains per-workout difficulty & notes
  }));

  const formattedDiets = (diets || []).map(d => {
    const mealLogs: any[] = [];
    if (d.tracking_data) {
      Object.keys(d.tracking_data).forEach(mealType => {
        d.tracking_data[mealType].forEach((log: any) => {
          if (log) mealLogs.push({ meal_type: mealType, ...log });
        });
      });
    }
    return { day: d.day, completed: d.completed, meals: mealLogs };
  });

  return {
    workouts_completed: workouts?.filter(w => w.completed).length || 0,
    diet_completed: diets?.filter(d => d.completed).length || 0,
    workout_logs: formattedWorkouts,
    diet_logs: formattedDiets
  };
}

// ============================================================
// AI GENERATION WITH FALLBACK
// ============================================================

async function generateWithGemini(prompt: string) {
  let lastError: any = null;

  for (const modelName of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Gemini request: ${modelName}, attempt ${attempt}`);
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        if (!text || !text.trim()) throw new Error('Empty response');
        return { model: modelName, text };
      } catch (error: any) {
        lastError = error;
        const retryable = isRetryableGeminiError(error);
        if (!retryable) throw error;
        if (attempt === 1) await sleep(1500);
      }
    }
  }
  throw (lastError || new Error('All Gemini models failed'));
}

function parseGeminiJSON(responseText: string) {
  let cleaned = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } 
  catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) return JSON.parse(cleaned.slice(first, last + 1));
    throw new Error('Gemini returned invalid JSON');
  }
}

// ============================================================
// MAIN POST ROUTE
// ============================================================

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json() as CheckinRequest;

    const { data: profile } = await supabase.from('profiles').select('*').eq('clerk_user_id', userId).maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: workoutPlan } = await supabase.from('workout_plans').select('*').eq('user_id', profile.id).eq('is_active', true).order('week_number', { ascending: false }).limit(1).maybeSingle();
    const { data: dietPlan } = await supabase.from('diet_plans').select('*').eq('user_id', profile.id).eq('is_active', true).order('week_number', { ascending: false }).limit(1).maybeSingle();
    
    if (!workoutPlan || !dietPlan) return NextResponse.json({ error: 'Active plans not found' }, { status: 404 });

    const currentWeek = workoutPlan.week_number;
    
    // Fetch granular tracking data
    const activityData = await fetchWeeklyActivities(profile.id, currentWeek);

    // Build the super-prompt
    const prompt = buildGeminiPrompt({
      profile,
      workoutPlan,
      dietPlan,
      currentWeek,
      activityData,
      feedback: body,
    });

    const geminiResult = await generateWithGemini(prompt);
    let aiOutput = parseGeminiJSON(geminiResult.text);

    // Ensure ai_analysis contains the rich text from the adaptation report
    const finalAnalysisText = aiOutput.adaptation_report 
      ? `${aiOutput.adaptation_report.summary} Key Changes: ${[...aiOutput.adaptation_report.workout_changes, ...aiOutput.adaptation_report.diet_changes].join(' ')}`
      : aiOutput.ai_analysis || "Plan successfully adapted for the new week.";

    // Save using the existing untouched RPC function
    const { data: transactionResult, error: transactionError } = await supabase.rpc('generate_new_week_plans', {
      p_user_id: profile.id,
      p_week_number: currentWeek,
      p_weight_kg: body.weight_kg,
      p_workout_difficulty: body.workout_difficulty,
      p_energy_rating: body.energy_rating,
      p_workouts_completed: activityData.workouts_completed,
      p_diet_completed: activityData.diet_completed,
      p_user_notes: body.user_notes ?? '',
      p_ai_analysis: finalAnalysisText,
      p_new_workout: aiOutput.workout,
      p_new_diet: aiOutput.diet,
    });

    if (transactionError) throw transactionError;

    return NextResponse.json({ success: true, week_number: currentWeek + 1 });
  } catch (error: any) {
    console.error('Check-in error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

// ============================================================
// THE INTELLIGENCE LAYER PROMPT
// ============================================================

function buildGeminiPrompt({ profile, workoutPlan, dietPlan, currentWeek, activityData, feedback }: any) {
  return `
You are an expert AI fitness and nutrition adaptation engine.
Your job is to generate the user's next 7-day personalized plan (Week ${currentWeek + 1}) based strictly on ACTUAL USER DATA, not just generic formulas.

CRITICAL PRINCIPLE: Distinguish PRESCRIBED vs ACTUAL vs FEEDBACK.
Do NOT randomly change exercises to make the plan "feel new". Every change must be justified by data.

====================
1. USER PROFILE (Constraints)
====================
${JSON.stringify(profile, null, 2)}

====================
2. PREVIOUS PRESCRIBED PLAN (Week ${currentWeek})
====================
Workout: ${JSON.stringify(workoutPlan.plan_data, null, 2)}
Diet: ${JSON.stringify(dietPlan.plan_data, null, 2)}

====================
3. ANY AI REPLACEMENTS MADE LAST WEEK
====================
Workout Swaps: ${JSON.stringify(workoutPlan.modifications || {}, null, 2)}
Diet Swaps: ${JSON.stringify(dietPlan.modifications || {}, null, 2)}

====================
4. ACTUAL WORKOUT EXECUTION & FEEDBACK
====================
Completed: ${activityData.workouts_completed}
Detailed Logs (Actual Sets/Reps & Difficulty):
${JSON.stringify(activityData.workout_logs, null, 2)}

====================
5. ACTUAL DIET ADHERENCE
====================
Completed: ${activityData.diet_completed}
Detailed Logs (Followed/Swapped/Skipped & Reasons):
${JSON.stringify(activityData.diet_logs, null, 2)}

====================
6. OVERALL WEEKLY CHECK-IN FEEDBACK
====================
Current Weight: ${feedback.weight_kg} kg
General Workout Difficulty: ${feedback.workout_difficulty}
Energy Rating: ${feedback.energy_rating}/5
User Notes: ${feedback.user_notes || 'None'}

====================
ADAPTATION RULES
====================
1. WORKOUT REGRESSION: If an exercise log shows "Actual Reps" consistently lower than "Prescribed Reps", OR feedback notes it was too hard, reduce volume, regress the exercise, or increase rest. DO NOT increase difficulty.
2. WORKOUT PROGRESSION: If an exercise was completed fully and feedback is "Easy", consider slight progressive overload (more reps, harder variation).
3. SKIPPED WORKOUTS: If workouts were repeatedly skipped or completion rate is low, REDUCE overall weekly volume or simplify the schedule.
4. DIET SWAPS: If a meal was repeatedly "Swapped" due to missing ingredients, DO NOT prescribe that meal again. Use the user's preferred swaps.
5. DIET SKIPS: If meals were "Skipped" due to budget or time, prescribe simpler, cheaper meals.
6. SAFETY: Respect the profile constraints (equipment, budget, available time).

RETURN ONLY RAW JSON matching this exact structure:
{
  "adaptation_report": {
    "summary": "2-sentence summary of actual performance vs prescribed.",
    "key_problems": ["List of identified struggles/skips"],
    "what_worked": ["List of successful adherences"],
    "workout_changes": ["Specifically what changed in the workout and WHY (based on logs)"],
    "diet_changes": ["Specifically what changed in the diet and WHY (based on logs)"]
  },
  "workout": { 
    "Monday": { "focus": "string", "duration_minutes": 30, "exercises": [ { "name": "...", "sets": "...", "reps": "...", "rest_seconds": "...", "notes": "..." } ] },
    "Tuesday": {}, "Wednesday": {}, "Thursday": {}, "Friday": {}, "Saturday": {}, "Sunday": {} 
  },
  "diet": {
    "Monday": { "breakfast": {}, "lunch": {}, "dinner": {}, "snacks": [], "daily_total_calories": 0, "daily_total_protein_g": 0 },
    "Tuesday": {}, "Wednesday": {}, "Thursday": {}, "Friday": {}, "Saturday": {}, "Sunday": {}
  }
}
`;
}
