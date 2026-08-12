import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

if (!supabaseUrl || !supabaseServiceKey || !geminiApiKey) {
  throw new Error('Required environment variables are missing.');
}

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey
);

const genAI = new GoogleGenerativeAI(geminiApiKey);

function cleanJson(text: string) {
  return text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

async function savePlan(
  table: 'workout_plans' | 'diet_plans',
  userId: string,
  planData: any
) {
  // Check if week 1 already exists
  const { data: existing, error: findError } = await supabaseAdmin
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .eq('week_number', 1)
    .maybeSingle();

  if (findError) {
    throw new Error(
      `${table} lookup failed: ${findError.message}`
    );
  }

  // Update existing plan
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .update({
        plan_data: planData,
        is_active: true,
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(
        `${table} update failed: ${error.message}`
      );
    }

    return data;
  }

  // Insert new plan
  const { data, error } = await supabaseAdmin
    .from(table)
    .insert({
      user_id: userId,
      plan_data: planData,
      week_number: 1,
      is_active: true,
    })
    .select()
    .single();

  if (error) {
    throw new Error(
      `${table} insert failed: ${error.message}`
    );
  }

  return data;
}

export async function POST() {
  try {
    // --------------------------------
    // 1. Get Clerk user
    // --------------------------------

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // --------------------------------
    // 2. Get profile
    // --------------------------------

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('clerk_user_id', userId)
        .single();

    if (profileError || !profile) {
      console.error('Profile error:', profileError);

      return NextResponse.json(
        {
          error:
            'Profile not found. Please complete onboarding first.',
        },
        { status: 404 }
      );
    }

    // --------------------------------
    // 3. Gemini prompt
    // --------------------------------

    const prompt = `
You are an expert fitness and nutrition planner.

Create a personalized 7-day workout plan and 7-day diet plan using the user's profile below.

USER PROFILE:
${JSON.stringify(profile, null, 2)}

IMPORTANT RULES:

- Return ONLY valid JSON.
- Do NOT use markdown.
- Do NOT use code fences.
- Do NOT add explanations outside the JSON.
- Workout must contain Monday through Sunday.
- Diet must contain Monday through Sunday.
- Respect the user's fitness goal.
- Respect experience level.
- Respect available equipment.
- Respect workout location.
- Respect training days per week.
- Respect session duration.
- Respect dietary preference.
- Use foods available to the user when possible.
- Never recommend foods that the user wants to avoid.
- Respect the user's budget.
- Include appropriate rest/recovery days.
- Keep the plan realistic and practical.

Return EXACTLY this structure:

{
  "workout": {
    "Monday": {
      "focus": "string",
      "duration_minutes": 30,
      "exercises": [
        {
          "name": "string",
          "sets": 3,
          "reps": "8-12",
          "rest_seconds": 60,
          "notes": "string"
        }
      ]
    },
    "Tuesday": {
      "focus": "string",
      "duration_minutes": 30,
      "exercises": []
    },
    "Wednesday": {
      "focus": "string",
      "duration_minutes": 30,
      "exercises": []
    },
    "Thursday": {
      "focus": "string",
      "duration_minutes": 30,
      "exercises": []
    },
    "Friday": {
      "focus": "string",
      "duration_minutes": 30,
      "exercises": []
    },
    "Saturday": {
      "focus": "string",
      "duration_minutes": 30,
      "exercises": []
    },
    "Sunday": {
      "focus": "Rest / Recovery",
      "duration_minutes": 0,
      "exercises": []
    }
  },

  "diet": {
    "Monday": {
      "breakfast": {
        "meal": "string",
        "items": ["string"],
        "approx_calories": 0,
        "approx_protein_g": 0
      },
      "lunch": {
        "meal": "string",
        "items": ["string"],
        "approx_calories": 0,
        "approx_protein_g": 0
      },
      "dinner": {
        "meal": "string",
        "items": ["string"],
        "approx_calories": 0,
        "approx_protein_g": 0
      },
      "snacks": [
        {
          "meal": "string",
          "items": ["string"],
          "approx_calories": 0,
          "approx_protein_g": 0
        }
      ],
      "daily_total_calories": 0,
      "daily_total_protein_g": 0
    },

    "Tuesday": {},
    "Wednesday": {},
    "Thursday": {},
    "Friday": {},
    "Saturday": {},
    "Sunday": {}
  }
}
`;

    // --------------------------------
    // 4. Call Gemini
    // --------------------------------

    const model = genAI.getGenerativeModel({
      model: 'gemini-3.5-flash-lite',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);

    const responseText = result.response.text();

    if (!responseText) {
      return NextResponse.json(
        {
          error: 'Gemini returned an empty response.',
        },
        { status: 502 }
      );
    }

    // --------------------------------
    // 5. Parse Gemini JSON
    // --------------------------------

    const cleaned = cleanJson(responseText);

    let plan: any;

    try {
      plan = JSON.parse(cleaned);
    } catch (error) {
      console.error('JSON parsing failed:', error);
      console.error('Gemini response:', responseText);

      return NextResponse.json(
        {
          error:
            'Gemini returned invalid JSON. Please try again.',
        },
        { status: 502 }
      );
    }

    if (!plan.workout || !plan.diet) {
      return NextResponse.json(
        {
          error:
            'Gemini returned an incomplete workout/diet plan.',
        },
        { status: 502 }
      );
    }

    // --------------------------------
    // 6. Save workout plan
    // --------------------------------

    const workoutPlan = await savePlan(
      'workout_plans',
      profile.id,
      plan.workout
    );

    // --------------------------------
    // 7. Save diet plan
    // --------------------------------

    const dietPlan = await savePlan(
      'diet_plans',
      profile.id,
      plan.diet
    );

    // --------------------------------
    // 8. Return result
    // --------------------------------

    return NextResponse.json({
      success: true,
      workout: workoutPlan,
      diet: dietPlan,
    });

  } catch (error: any) {
    console.error(
      'Generate plan API error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Internal server error while generating plan.',
      },
      { status: 500 }
    );
  }
      }
