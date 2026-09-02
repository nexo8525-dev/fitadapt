import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const genAI = new GoogleGenerativeAI(geminiApiKey);

// Added highly reliable fallback models
const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-3.5-flash', 'gemini-3.6-flash'];

// Advanced JSON extractor to prevent parse crashes
function extractJSON(text: string): any {
  try {
    let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleaned = cleaned.substring(start, end + 1);
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Error. Raw AI Output:", text);
    throw new Error("AI did not return valid JSON");
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('clerk_user_id', userId).maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const { data: workoutPlans } = await supabaseAdmin.from('workout_plans').select('*').eq('user_id', profile.id).order('week_number', { ascending: false }).limit(2);
    const { data: dietPlans } = await supabaseAdmin.from('diet_plans').select('*').eq('user_id', profile.id).order('week_number', { ascending: false }).limit(2);
    
    const { data: latestCheckin } = await supabaseAdmin.from('weekly_checkins').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!workoutPlans || workoutPlans.length === 0) {
      return NextResponse.json({ error: 'No active plan found' }, { status: 404 });
    }

    const currentWorkout = workoutPlans[0];
    const previousWorkout = workoutPlans.length > 1 ? workoutPlans[1] : null;
    const currentDiet = dietPlans && dietPlans.length > 0 ? dietPlans[0] : null;
    const previousDiet = dietPlans && dietPlans.length > 1 ? dietPlans[1] : null;

    const prompt = `
You are a Plan Transparency Engine for a fitness app. Your ONLY job is to explain WHY the user's current plan looks the way it does based STRICTLY on the data provided.

RULES:
- DO NOT invent reasons.
- DO NOT claim exact prices for food.
- For Week-over-Week changes, compare Previous Plan to Current Plan. If no previous plan, explain the current plan based purely on Profile Constraints.
- Return ONLY valid JSON.

DATA:
Profile Constraints: ${JSON.stringify({ goal: profile.fitness_goal, equipment: profile.equipment, time: profile.time_per_session_min, diet: profile.dietary_preference })}
Current Workout (Week ${currentWorkout.week_number}): ${JSON.stringify(currentWorkout.plan_data)}
Current Diet: ${JSON.stringify(currentDiet?.plan_data || {})}
${previousWorkout ? `Previous Workout: ${JSON.stringify(previousWorkout.plan_data)}` : ''}
${latestCheckin ? `Weekly Feedback: Difficulty=${latestCheckin.workout_difficulty}, Notes="${latestCheckin.user_notes}"` : ''}

OUTPUT FORMAT:
{
  "workout_explanation": "Concise paragraph explaining the training structure and exercise selection.",
  "diet_explanation": "Concise paragraph explaining food choices.",
  "changes": [
    {
      "item": "e.g., Push-ups",
      "change": "e.g., Increased reps",
      "reason": "e.g., You rated last week as too easy."
    }
  ]
}
`;

    let explanation = null;
    let lastError = null;

    for (const modelName of GEMINI_MODELS) {
      try {
        console.log(`Explain API: Trying model ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });
        const result = await model.generateContent(prompt);
        explanation = extractJSON(result.response.text());
        break; // If successful, exit the loop
      } catch (err) {
        console.error(`Explain API: Model ${modelName} failed`);
        lastError = err;
      }
    }

    if (!explanation) throw lastError || new Error("Failed to generate explanation");

    return NextResponse.json({ success: true, explanation });
  } catch (error: any) {
    console.error('Explain API Critical Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to generate explanation' }, { status: 500 });
  }
}
