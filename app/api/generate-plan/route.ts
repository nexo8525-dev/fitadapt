import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey
);

const genAI = new GoogleGenerativeAI(geminiApiKey);

function cleanJsonResponse(text: string): string {
  return text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
}

export async function POST() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select(`
        id,
        full_name,
        age,
        gender,
        height_cm,
        weight_kg,
        fitness_goal,
        experience_level,
        workout_location,
        equipment,
        training_days,
        time_per_session_min,
        pushup_capacity,
        dietary_preference,
        available_foods,
        disliked_foods,
        diet_budget_per_month
      `)
      .eq('clerk_user_id', userId)
      .single();

    if (profileError || !profile) {
      console.error('Profile fetch error:', profileError);

      return NextResponse.json(
        {
          error:
            'Profile not found. Please complete onboarding first.',
        },
        { status: 404 }
      );
    }

    const prompt = `
You are an expert fitness and nutrition planner.

Create a personalized 7-day workout plan and 7-day diet plan based only on this user's profile:

${JSON.stringify(profile, null, 2)}

RULES:

1. Return ONLY valid JSON.
2. Do not use markdown.
3. Do not wrap the JSON in code fences.
4. Do not include explanations outside the JSON.
5. Workout must contain exactly 7 days: Monday through Sunday.
6. Diet must contain exactly 7 days: Monday through Sunday.
7. Respect the user's fitness goal, experience level, equipment, location, training days and session duration.
8. Respect dietary preference, available foods, disliked foods and monthly budget.
9. Never recommend foods listed in disliked_foods.
10. Keep the plan practical and realistic.
11. Include rest/recovery days where appropriate.
12. Do not diagnose medical conditions.

Return this exact JSON structure:

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
    "Tuesday": {},
    "Wednesday": {},
    "Thursday": {},
    "Friday": {},
    "Saturday": {},
    "Sunday": {}
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

    const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    if (!responseText) {
      return NextResponse.json(
        { error: 'Gemini returned an empty response.' },
        { status: 502 }
      );
    }

    const cleanedResponse = cleanJsonResponse(responseText);

    let plan: any;

    try {
      plan = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Gemini JSON parse error:', parseError);
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
            'Gemini returned an incomplete plan. Please try again.',
        },
        { status: 502 }
      );
    }

    const { data: workoutPlan, error: workoutError } =
      await supabaseAdmin
        .from('workout_plans')
        .upsert(
          {
            user_id: profile.id,
            plan_data: plan.workout,
            week_number: 1,
            is_active: true,
          },
          {
            onConflict: 'user_id,week_number',
          }
        )
        .select()
        .single();

    if (workoutError) {
      console.error(
        'Workout plan save error:',
        workoutError
      );

      return NextResponse.json(
        { error: 'Failed to save workout plan.' },
        { status: 500 }
      );
    }

    const { data: dietPlan, error: dietError } =
      await supabaseAdmin
        .from('diet_plans')
        .upsert(
          {
            user_id: profile.id,
            plan_data: plan.diet,
            week_number: 1,
            is_active: true,
          },
          {
            onConflict: 'user_id',
          }
        )
        .select()
        .single();

    if (dietError) {
      console.error(
        'Diet plan save error:',
        dietError
      );

      return NextResponse.json(
        { error: 'Failed to save diet plan.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      workout: workoutPlan,
      diet: dietPlan,
    });
  } catch (error) {
    console.error('Generate plan API error:', error);

    return NextResponse.json(
      {
        error:
          'Internal server error while generating plan.',
      },
      { status: 500 }
    );
  }
}
