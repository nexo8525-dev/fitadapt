import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

export async function POST(req: NextRequest) {
  try {
    // 1. Clerk se user verify
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Supabase Admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 3. Profile fetch karo
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('clerk_user_id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // 4. Gemini API call
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // 5. PROMPT - Exact constraints ke saath, structured output ke liye
    const prompt = `
You are an expert fitness coach and nutritionist.
Create a personalized 1-week workout and diet plan for this user.

USER PROFILE (HARD CONSTRAINTS - DO NOT IGNORE):
- Goal: ${profile.fitness_goal}
- Experience: ${profile.experience_level}
- Gender: ${profile.gender}
- Age: ${profile.age}
- Height: ${profile.height_cm} cm
- Weight: ${profile.weight_kg} kg
- Training Location: ${profile.workout_location}
- Equipment Available: ${profile.equipment || 'None specified'}
- Days available per week: ${profile.training_days}
- Time per session: ${profile.time_per_session_min} minutes
- Max push-ups: ${profile.pushup_capacity}
- Diet Preference: ${profile.dietary_preference}
- Foods Available: ${profile.available_foods}
- Foods to Avoid: ${profile.disliked_foods || 'None'}
- Budget (monthly): ${profile.diet_budget_per_month || 'Not specified'}

IMPORTANT RULES:
1. Workout MUST fit within ${profile.time_per_session_min} minutes.
2. Exercises MUST use only available equipment: ${profile.equipment || 'bodyweight'}.
3. If beginner, use basic exercises. If advanced, increase intensity.
4. Diet MUST use only the foods listed as available.
5. DO NOT recommend foods the user dislikes/avoids.
6. Provide realistic, practical advice.

OUTPUT FORMAT (STRICT JSON - NO EXTRA TEXT):
{
  "workout": {
    "days": [
      {
        "day": 1,
        "focus": "Push",
        "exercises": [
          {
            "name": "Push-ups",
            "sets": 3,
            "reps": "8-12",
            "rest": "60s",
            "notes": "Keep core tight"
          }
        ]
      }
    ],
    "weekly_notes": "Rest on day 4 and 7."
  },
  "diet": {
    "daily_meals": [
      {
        "day": 1,
        "meals": [
          {
            "name": "Oats Breakfast",
            "ingredients": ["Oats", "Milk", "Banana"],
            "nutrition": "300 cal, 10g protein"
          }
        ]
      }
    ],
    "weekly_notes": "Stay hydrated."
  }
}

Generate the full week plan (${profile.training_days} days). Return ONLY valid JSON.
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 6. JSON parse karo (Gemini se text aata hai, clean karo)
    let planData;
    try {
      // Sometimes Gemini wraps JSON in markdown ```json ... ```
      const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
      planData = JSON.parse(cleanText);
    } catch (parseError) {
      console.error('Failed to parse Gemini JSON:', text);
      return NextResponse.json({ error: 'AI returned invalid format' }, { status: 500 });
    }

    // 7. Workout Plan save karo
    const workoutPayload = {
      user_id: profile.id, // Clerk ID
      week_number: 1,
      plan_data: planData.workout,
      is_active: true,
    };

    const { error: workoutError } = await supabaseAdmin
      .from('workout_plans')
      .insert(workoutPayload);

    if (workoutError) {
      console.error('Workout save error:', workoutError);
    }

    // 8. Diet Plan save karo
    const dietPayload = {
      user_id: profile.id,
      week_number: 1,
      plan_data: planData.diet,
      is_active: true,
    };

    const { error: dietError } = await supabaseAdmin
      .from('diet_plans')
      .insert(dietPayload);

    if (dietError) {
      console.error('Diet save error:', dietError);
    }

    // 9. Success response
    return NextResponse.json({
      success: true,
      workout: planData.workout,
      diet: planData.diet,
    });
  } catch (error) {
    console.error('Generate Plan Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
                                                  }
