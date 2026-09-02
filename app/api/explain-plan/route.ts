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
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash'];

function cleanJson(text: string): string {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. Fetch Profile
    const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('clerk_user_id', userId).maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // 2. Fetch Workout & Diet Plans (Current and Previous)
    const { data: workoutPlans } = await supabaseAdmin.from('workout_plans').select('*').eq('user_id', profile.id).order('week_number', { ascending: false }).limit(2);
    const { data: dietPlans } = await supabaseAdmin.from('diet_plans').select('*').eq('user_id', profile.id).order('week_number', { ascending: false }).limit(2);
    
    // 3. Fetch latest check-in/adaptation reasoning
    const { data: latestCheckin } = await supabaseAdmin.from('weekly_checkins').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (!workoutPlans || workoutPlans.length === 0) {
      return NextResponse.json({ error: 'No active plan found' }, { status: 404 });
    }

    const currentWorkout = workoutPlans[0];
    const previousWorkout = workoutPlans.length > 1 ? workoutPlans[1] : null;
    const currentDiet = dietPlans ? dietPlans[0] : null;
    const previousDiet = dietPlans && dietPlans.length > 1 ? dietPlans[1] : null;

    // 4. Construct Strict Transparency Prompt
    const prompt = `
You are a Plan Transparency Engine for a fitness app. Your ONLY job is to explain WHY the user's current plan looks the way it does based STRICTLY on the data provided.

RULES:
- DO NOT invent reasons or hallucinate.
- DO NOT claim exact prices for food.
- DO NOT say "Because this is perfect for your body." Use data-backed reasons (e.g., "Because you only have 30 minutes, the volume is condensed").
- For Week-over-Week changes, compare the Previous Plan to the Current Plan and reference the "Weekly Feedback" to explain WHY it changed. If there is no previous plan, explain the current plan based purely on the Profile Constraints.

DATA:
Profile Constraints: ${JSON.stringify({ goal: profile.fitness_goal, equipment: profile.equipment, time: profile.time_per_session_min, diet: profile.dietary_preference, available_foods: profile.available_foods, disliked_foods: profile.disliked_foods })}
Current Workout (Week ${currentWorkout.week_number}): ${JSON.stringify(currentWorkout.plan_data)}
Current Diet (Week ${currentDiet?.week_number}): ${JSON.stringify(currentDiet?.plan_data)}
${previousWorkout ? `Previous Workout (Week ${previousWorkout.week_number}): ${JSON.stringify(previousWorkout.plan_data)}` : ''}
${previousDiet ? `Previous Diet (Week ${previousDiet.week_number}): ${JSON.stringify(previousDiet.plan_data)}` : ''}
${latestCheckin ? `Weekly Feedback (from previous week): Difficulty=${latestCheckin.workout_difficulty}, Notes="${latestCheckin.user_notes}", AI Analysis="${latestCheckin.ai_analysis}"` : ''}

OUTPUT FORMAT:
Return ONLY raw JSON in this exact structure:
{
  "workout_explanation": "Concise paragraph explaining the training structure, difficulty, and exercise selection based on equipment/time/goals.",
  "diet_explanation": "Concise paragraph explaining food choices based on available foods, dislikes, and dietary preferences.",
  "changes": [
    {
      "item": "e.g., Push-ups",
      "change": "e.g., Increased from 3x10 to 3x12",
      "reason": "e.g., You rated last week's workout as 'Too Easy'."
    }
  ]
}
`;

    let resultText = "";
    let success = false;

    for (const modelName of GEMINI_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });
        const result = await model.generateContent(prompt);
        resultText = result.response.text();
        success = true; break;
      } catch (err) {
        console.error(`Explain API: Model ${modelName} failed`);
      }
    }

    if (!success) throw new Error("AI models failed to generate transparency report.");

    const explanation = JSON.parse(cleanJson(resultText));
    return NextResponse.json({ success: true, explanation });
  } catch (error: any) {
    console.error('Explain API Error:', error);
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 });
  }
}
