import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// ENVIRONMENT
// ============================================================

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const geminiApiKey =
  process.env.GEMINI_API_KEY;

if (!supabaseUrl) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL is missing'
  );
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is missing'
  );
}

if (!geminiApiKey) {
  throw new Error(
    'GEMINI_API_KEY is missing'
  );
}

// ============================================================
// SUPABASE ADMIN CLIENT
// SERVER ONLY
// ============================================================

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// ============================================================
// GEMINI
// ============================================================

const genAI =
  new GoogleGenerativeAI(
    geminiApiKey
  );

// ============================================================
// GEMINI MODEL FALLBACK
//
// Primary:
// 3.6 Flash
//
// Fallback:
// 3.5 Flash
// 3.5 Flash-Lite
//
// This prevents the entire app from breaking when
// one Gemini model temporarily returns 503/429.
// ============================================================

const GEMINI_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
];

async function generateWithFallback(
  prompt: string
): Promise<string> {
  let lastError: any = null;

  for (const modelName of GEMINI_MODELS) {
    try {
      console.log(
        `Trying Gemini model: ${modelName}`
      );

      const model =
        genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            responseMimeType:
              'application/json',
          },
        });

      const result =
        await model.generateContent(
          prompt
        );

      const text =
        result.response.text();

      if (
        !text ||
        !text.trim()
      ) {
        throw new Error(
          `${modelName} returned an empty response`
        );
      }

      console.log(
        `Gemini success: ${modelName}`
      );

      return text;
    } catch (error: any) {
      lastError = error;

      console.error(
        `Gemini ${modelName} failed:`,
        error?.message || error
      );
    }
  }

  throw (
    lastError ||
    new Error(
      'All Gemini models failed'
    )
  );
}

// ============================================================
// TYPES
// ============================================================

type PlanType =
  | 'workout_plans'
  | 'diet_plans';

// ============================================================
// CLEAN GEMINI JSON
// ============================================================

function cleanJson(
  text: string
): string {
  return text
    .replace(
      /```json/gi,
      ''
    )
    .replace(
      /```/g,
      ''
    )
    .trim();
}

// ============================================================
// PARSE GEMINI JSON
// ============================================================

function parseGeminiJson(
  text: string
): any {
  const cleaned =
    cleanJson(text);

  // First try direct JSON
  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    // Continue below
  }

  // Fallback:
  // Find first { and last }
  const start =
    cleaned.indexOf('{');

  const end =
    cleaned.lastIndexOf('}');

  if (
    start === -1 ||
    end === -1 ||
    end <= start
  ) {
    throw new Error(
      'No valid JSON object found'
    );
  }

  const extracted =
    cleaned.slice(
      start,
      end + 1
    );

  return JSON.parse(
    extracted
  );
}

// ============================================================
// VALIDATE GENERATED PLAN
// ============================================================

function validatePlan(
  plan: any
): boolean {
  if (
    !plan ||
    typeof plan !== 'object'
  ) {
    return false;
  }

  if (
    !plan.workout ||
    typeof plan.workout !==
      'object'
  ) {
    return false;
  }

  if (
    !plan.diet ||
    typeof plan.diet !==
      'object'
  ) {
    return false;
  }

  const days = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  // ----------------------------------------------------------
  // Validate workout
  // ----------------------------------------------------------

  for (const day of days) {
    const workoutDay =
      plan.workout[day];

    if (
      !workoutDay ||
      typeof workoutDay !==
        'object'
    ) {
      return false;
    }

    if (
      typeof workoutDay.focus !==
      'string'
    ) {
      return false;
    }

    if (
      typeof workoutDay.duration_minutes !==
      'number'
    ) {
      return false;
    }

    if (
      !Array.isArray(
        workoutDay.exercises
      )
    ) {
      return false;
    }
  }

  // ----------------------------------------------------------
  // Validate diet
  // ----------------------------------------------------------

  for (const day of days) {
    const dietDay =
      plan.diet[day];

    if (
      !dietDay ||
      typeof dietDay !==
        'object'
    ) {
      return false;
    }

    // Sunday may be a recovery/simple diet day,
    // but the AI should still return an object.
    if (
      day !== 'Sunday'
    ) {
      if (
        !dietDay.breakfast ||
        !dietDay.lunch ||
        !dietDay.dinner ||
        !Array.isArray(
          dietDay.snacks
        )
      ) {
        return false;
      }
    }
  }

  return true;
}

// ============================================================
// SAVE PLAN
// ============================================================

async function savePlan(
  table: PlanType,
  userId: string,
  planData: any
) {
  // ----------------------------------------------------------
  // 1. Deactivate previous active plans
  // ----------------------------------------------------------

  const {
    error: deactivateError,
  } =
    await supabaseAdmin
      .from(table)
      .update({
        is_active: false,
      })
      .eq(
        'user_id',
        userId
      );

  if (deactivateError) {
    throw new Error(
      `${table} deactivate failed: ${deactivateError.message}`
    );
  }

  // ----------------------------------------------------------
  // 2. Check whether Week 1 already exists
  // ----------------------------------------------------------

  const {
    data: existing,
    error: findError,
  } =
    await supabaseAdmin
      .from(table)
      .select('id')
      .eq(
        'user_id',
        userId
      )
      .eq(
        'week_number',
        1
      )
      .maybeSingle();

  if (findError) {
    throw new Error(
      `${table} lookup failed: ${findError.message}`
    );
  }

  // ----------------------------------------------------------
  // 3. Update existing Week 1
  // ----------------------------------------------------------

  if (existing) {
    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from(table)
        .update({
          plan_data:
            planData,
          is_active:
            true,
        })
        .eq(
          'id',
          existing.id
        )
        .select()
        .single();

    if (error) {
      throw new Error(
        `${table} update failed: ${error.message}`
      );
    }

    return data;
  }

  // ----------------------------------------------------------
  // 4. Create Week 1
  // ----------------------------------------------------------

  const {
    data,
    error,
  } =
    await supabaseAdmin
      .from(table)
      .insert({
        user_id:
          userId,

        plan_data:
          planData,

        week_number:
          1,

        is_active:
          true,
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

// ============================================================
// POST
// ============================================================

export async function POST() {
  try {
    // --------------------------------------------------------
    // 1. AUTHENTICATION
    // --------------------------------------------------------

    const {
      userId,
    } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          error:
            'Unauthorized',
        },
        {
          status: 401,
        }
      );
    }

    // --------------------------------------------------------
    // 2. FETCH PROFILE
    // --------------------------------------------------------

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq(
          'clerk_user_id',
          userId
        )
        .maybeSingle();

    if (profileError) {
      console.error(
        'Profile error:',
        profileError
      );

      return NextResponse.json(
        {
          error:
            'Failed to fetch profile',
        },
        {
          status: 500,
        }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          error:
            'Profile not found. Please complete onboarding first.',
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------------
    // 3. BUILD GEMINI PROMPT
    // --------------------------------------------------------

    const prompt = `
You are an expert fitness and nutrition planning AI.

Create a personalized FIRST WEEK plan for this user.

USER PROFILE:
${JSON.stringify(
  profile,
  null,
  2
)}

RULES:

1. Respect the user's fitness goal.
2. Respect experience level.
3. Respect available equipment.
4. Respect workout location.
5. Respect training days per week.
6. Respect session duration.
7. Respect dietary preference.
8. Use available foods whenever possible.
9. Avoid disliked foods.
10. Respect the user's diet budget.
11. Keep the plan realistic and sustainable.
12. Include proper recovery/rest.
13. Do not recommend extreme dieting.
14. Do not recommend dangerous training.
15. Do not invent equipment the user does not have.
16. Workout must contain Monday through Sunday.
17. Diet must contain Monday through Sunday.
18. Sunday may be a recovery/rest day.
19. Every workout day must contain an exercises array.
20. Every diet day must contain food information.
21. Calories and protein are approximate estimates.
22. Do not give medical advice.
23. Do not use markdown.
24. Do not use code fences.
25. Return ONLY JSON.

IMPORTANT:
The user's actual profile values must be followed.
Do not replace profile information with assumptions.

RETURN EXACTLY THIS STRUCTURE:

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

    // --------------------------------------------------------
    // 4. GENERATE WITH GEMINI FALLBACK
    // --------------------------------------------------------

    const responseText =
      await generateWithFallback(
        prompt
      );

    // --------------------------------------------------------
    // 5. CHECK RESPONSE
    // --------------------------------------------------------

    if (
      !responseText ||
      !responseText.trim()
    ) {
      return NextResponse.json(
        {
          error:
            'Gemini returned an empty response.',
        },
        {
          status: 502,
        }
      );
    }

    // --------------------------------------------------------
    // 6. PARSE JSON
    // --------------------------------------------------------

    let plan: any;

    try {
      plan =
        parseGeminiJson(
          responseText
        );
    } catch (error) {
      console.error(
        'Gemini JSON parsing failed:',
        error
      );

      console.error(
        'Gemini response:',
        responseText
      );

      return NextResponse.json(
        {
          error:
            'Gemini returned invalid JSON. Please try again.',
        },
        {
          status: 502,
        }
      );
    }

    // --------------------------------------------------------
    // 7. VALIDATE PLAN
    // --------------------------------------------------------

    if (
      !validatePlan(
        plan
      )
    ) {
      console.error(
        'Invalid plan structure:',
        plan
      );

      return NextResponse.json(
        {
          error:
            'Gemini returned an incomplete workout/diet plan.',
        },
        {
          status: 502,
        }
      );
    }

    // --------------------------------------------------------
    // 8. SAVE WORKOUT
    // --------------------------------------------------------

    const workoutPlan =
      await savePlan(
        'workout_plans',
        profile.id,
        plan.workout
      );

    // --------------------------------------------------------
    // 9. SAVE DIET
    // --------------------------------------------------------

    const dietPlan =
      await savePlan(
        'diet_plans',
        profile.id,
        plan.diet
      );

    // --------------------------------------------------------
    // 10. SUCCESS
    // --------------------------------------------------------

    return NextResponse.json(
      {
        success: true,

        week_number: 1,

        workout:
          workoutPlan,

        diet:
          dietPlan,
      },
      {
        status: 200,
      }
    );
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
      {
        status: 500,
      }
    );
  }
}
