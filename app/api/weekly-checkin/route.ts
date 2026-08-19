import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ============================================================
// Environment
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
// Server-only Supabase client
// ============================================================

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

// ============================================================
// Gemini
// ============================================================

const genAI =
  new GoogleGenerativeAI(geminiApiKey);

const model =
  genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
  });

// ============================================================
// Types
// ============================================================

type WorkoutDifficulty =
  | 'Too Easy'
  | 'Just Right'
  | 'Too Hard';

interface CheckinRequest {
  weight_kg: number;
  workout_difficulty: WorkoutDifficulty;
  energy_rating: number;
  user_notes?: string;
}

// ============================================================
// Validation
// ============================================================

function validateRequest(
  body: any
): CheckinRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const {
    weight_kg,
    workout_difficulty,
    energy_rating,
    user_notes,
  } = body;

  if (
    typeof weight_kg !== 'number' ||
    !Number.isFinite(weight_kg) ||
    weight_kg <= 0
  ) {
    throw new Error(
      'Invalid weight_kg'
    );
  }

  const validDifficulties = [
    'Too Easy',
    'Just Right',
    'Too Hard',
  ];

  if (
    !validDifficulties.includes(
      workout_difficulty
    )
  ) {
    throw new Error(
      'Invalid workout_difficulty'
    );
  }

  if (
    typeof energy_rating !== 'number' ||
    !Number.isInteger(energy_rating) ||
    energy_rating < 1 ||
    energy_rating > 5
  ) {
    throw new Error(
      'energy_rating must be between 1 and 5'
    );
  }

  return {
    weight_kg,
    workout_difficulty,
    energy_rating,
    user_notes:
      typeof user_notes === 'string'
        ? user_notes.trim()
        : '',
  };
}

// ============================================================
// Activity counts
// ============================================================

async function countCompletedActivities(
  userId: string,
  weekNumber: number
) {
  const {
    count: workoutCount,
    error: workoutError,
  } = await supabase
    .from('workout_activity')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('user_id', userId)
    .eq('week_number', weekNumber)
    .eq('completed', true);

  if (workoutError) {
    throw new Error(
      `Workout activity error: ${workoutError.message}`
    );
  }

  const {
    count: dietCount,
    error: dietError,
  } = await supabase
    .from('diet_activity')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('user_id', userId)
    .eq('week_number', weekNumber)
    .eq('completed', true);

  if (dietError) {
    throw new Error(
      `Diet activity error: ${dietError.message}`
    );
  }

  return {
    workouts_completed:
      workoutCount ?? 0,
    diet_completed:
      dietCount ?? 0,
  };
}

// ============================================================
// POST
// ============================================================

export async function POST(
  req: Request
) {
  try {
    // --------------------------------------------------------
    // Authentication
    // --------------------------------------------------------

    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
        },
        {
          status: 401,
        }
      );
    }

    // --------------------------------------------------------
    // Body
    // --------------------------------------------------------

    let body: any;

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: 'Invalid JSON body',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // Validation
    // --------------------------------------------------------

    let checkin: CheckinRequest;

    try {
      checkin =
        validateRequest(body);
    } catch (error: any) {
      return NextResponse.json(
        {
          error:
            error?.message ||
            'Invalid request',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // Profile
    // --------------------------------------------------------

    const {
      data: profile,
      error: profileError,
    } = await supabase
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
            'User profile not found',
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------------
    // Active workout
    // --------------------------------------------------------

    const {
      data: workoutPlan,
      error: workoutPlanError,
    } = await supabase
      .from('workout_plans')
      .select('*')
      .eq(
        'user_id',
        profile.id
      )
      .eq(
        'is_active',
        true
      )
      .maybeSingle();

    if (workoutPlanError) {
      console.error(
        'Workout plan error:',
        workoutPlanError
      );

      return NextResponse.json(
        {
          error:
            'Failed to fetch workout plan',
        },
        {
          status: 500,
        }
      );
    }

    if (!workoutPlan) {
      return NextResponse.json(
        {
          error:
            'No active workout plan',
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------------
    // Active diet
    // --------------------------------------------------------

    const {
      data: dietPlan,
      error: dietPlanError,
    } = await supabase
      .from('diet_plans')
      .select('*')
      .eq(
        'user_id',
        profile.id
      )
      .eq(
        'is_active',
        true
      )
      .maybeSingle();

    if (dietPlanError) {
      console.error(
        'Diet plan error:',
        dietPlanError
      );

      return NextResponse.json(
        {
          error:
            'Failed to fetch diet plan',
        },
        {
          status: 500,
        }
      );
    }

    if (!dietPlan) {
      return NextResponse.json(
        {
          error:
            'No active diet plan',
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------------
    // Current week
    // --------------------------------------------------------

    const currentWeek =
      workoutPlan.week_number;

    // --------------------------------------------------------
    // Activity counts
    // --------------------------------------------------------

    const {
      workouts_completed,
      diet_completed,
    } =
      await countCompletedActivities(
        profile.id,
        currentWeek
      );

    // --------------------------------------------------------
    // Gemini prompt
    // --------------------------------------------------------

    const prompt =
      buildGeminiPrompt({
        profile,
        workoutPlan,
        dietPlan,
        currentWeek,
        workouts_completed,
        diet_completed,
        feedback: checkin,
      });

    // --------------------------------------------------------
    // Gemini
    // --------------------------------------------------------

    const result =
      await model.generateContent(
        prompt
      );

    const responseText =
      result.response.text();

    // --------------------------------------------------------
    // Parse AI JSON
    // --------------------------------------------------------

    let aiOutput: any;

    try {
      const fenced =
        responseText.match(
          /```json\s*([\s\S]*?)\s*```/i
        );

      const object =
        responseText.match(
          /(\{[\s\S]*\})/
        );

      const jsonString =
        fenced?.[1] ??
        object?.[1] ??
        responseText;

      aiOutput =
        JSON.parse(
          jsonString.trim()
        );
    } catch (error) {
      console.error(
        'Gemini response:',
        responseText
      );

      return NextResponse.json(
        {
          error:
            'AI returned invalid JSON',
        },
        {
          status: 502,
        }
      );
    }

    // --------------------------------------------------------
    // Validate AI output
    // --------------------------------------------------------

    if (
      !aiOutput ||
      typeof aiOutput !== 'object' ||
      typeof aiOutput.ai_analysis !==
        'string' ||
      !aiOutput.workout ||
      !aiOutput.diet
    ) {
      return NextResponse.json(
        {
          error:
            'AI response is missing required fields',
        },
        {
          status: 502,
        }
      );
    }

    // --------------------------------------------------------
    // Save everything through RPC
    // --------------------------------------------------------

    const {
      data: transactionResult,
      error: transactionError,
    } =
      await supabase.rpc(
        'generate_new_week_plans',
        {
          p_user_id:
            profile.id,

          p_week_number:
            currentWeek,

          p_weight_kg:
            checkin.weight_kg,

          p_workout_difficulty:
            checkin.workout_difficulty,

          p_energy_rating:
            checkin.energy_rating,

          p_workouts_completed:
            workouts_completed,

          p_diet_completed:
            diet_completed,

          p_user_notes:
            checkin.user_notes ?? '',

          p_ai_analysis:
            aiOutput.ai_analysis,

          p_new_workout:
            aiOutput.workout,

          p_new_diet:
            aiOutput.diet,
        }
      );

    if (transactionError) {
      console.error(
        'RPC error:',
        transactionError
      );

      return NextResponse.json(
        {
          error:
            'Database transaction failed',
          details:
            transactionError.message,
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      success: true,
      week_number:
        currentWeek + 1,
      ai_analysis:
        aiOutput.ai_analysis,
      workout:
        aiOutput.workout,
      diet:
        aiOutput.diet,
      transaction_result:
        transactionResult,
    });
  } catch (error: any) {
    console.error(
      'Weekly check-in error:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          'Internal server error',
      },
      {
        status: 500,
      }
    );
  }
}

// ============================================================
// Gemini Prompt
// ============================================================

function buildGeminiPrompt({
  profile,
  workoutPlan,
  dietPlan,
  currentWeek,
  workouts_completed,
  diet_completed,
  feedback,
}: {
  profile: any;
  workoutPlan: any;
  dietPlan: any;
  currentWeek: number;
  workouts_completed: number;
  diet_completed: number;
  feedback: CheckinRequest;
}) {
  return `
You are an expert fitness and nutrition coach.

Generate a personalized plan for Week ${
    currentWeek + 1
  }.

USER BASELINE:
${JSON.stringify(
  profile,
  null,
  2
)}

PREVIOUS WORKOUT PLAN:
${JSON.stringify(
  workoutPlan.plan_data,
  null,
  2
)}

PREVIOUS DIET PLAN:
${JSON.stringify(
  dietPlan.plan_data,
  null,
  2
)}

ADHERENCE:
- Workout days completed: ${workouts_completed}/7
- Diet days completed: ${diet_completed}/7

WEEKLY FEEDBACK:
- Weight: ${feedback.weight_kg} kg
- Workout difficulty: ${feedback.workout_difficulty}
- Energy: ${feedback.energy_rating}/5
- Notes: ${
    feedback.user_notes ||
    'None'
  }

RULES:
- Consider adherence before making major changes.
- If training is Too Easy, use progressive overload.
- If training is Too Hard or energy is below 3, reduce volume/intensity.
- Keep nutrition practical and reasonable.
- Respect the user's equipment, budget and preferences.
- Do not make extreme or unsafe recommendations.

Return ONLY valid JSON.

{
  "ai_analysis": "3-4 sentence weekly analysis.",
  "workout": {
    "Monday": {
      "focus": "",
      "duration_minutes": 0,
      "exercises": []
    },
    "Tuesday": {
      "focus": "",
      "duration_minutes": 0,
      "exercises": []
    },
    "Wednesday": {
      "focus": "",
      "duration_minutes": 0,
      "exercises": []
    },
    "Thursday": {
      "focus": "",
      "duration_minutes": 0,
      "exercises": []
    },
    "Friday": {
      "focus": "",
      "duration_minutes": 0,
      "exercises": []
    },
    "Saturday": {
      "focus": "",
      "duration_minutes": 0,
      "exercises": []
    },
    "Sunday": {
      "focus": "",
      "duration_minutes": 0,
      "exercises": []
    }
  },
  "diet": {
    "Monday": {},
    "Tuesday": {},
    "Wednesday": {},
    "Thursday": {},
    "Friday": {},
    "Saturday": {},
    "Sunday": {}
  }
}
`;
}
