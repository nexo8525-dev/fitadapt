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
// SUPABASE
// ============================================================

const supabase = createClient(
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
  new GoogleGenerativeAI(geminiApiKey);

// ============================================================
// TYPES
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
// GEMINI MODELS
//
// We try the newest model first.
// If Google temporarily returns 503/429,
// we automatically try the next model.
//
// This prevents a temporary model overload from
// breaking the whole weekly check-in.
// ============================================================

const GEMINI_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

// ============================================================
// HELPERS
// ============================================================

function sleep(ms: number) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

function isRetryableGeminiError(
  error: any
) {
  const message =
    String(
      error?.message ||
        error ||
        ''
    ).toLowerCase();

  return (
    message.includes('503') ||
    message.includes('service unavailable') ||
    message.includes('high demand') ||
    message.includes('429') ||
    message.includes('resource exhausted') ||
    message.includes('rate limit') ||
    message.includes('temporarily unavailable')
  );
}

// ============================================================
// VALIDATION
// ============================================================

function validateRequest(
  body: any
): CheckinRequest {
  if (
    !body ||
    typeof body !== 'object'
  ) {
    throw new Error(
      'Invalid request body'
    );
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
    !Number.isInteger(
      energy_rating
    ) ||
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
// COUNT COMPLETED ACTIVITIES
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
    .eq(
      'user_id',
      userId
    )
    .eq(
      'week_number',
      weekNumber
    )
    .eq(
      'completed',
      true
    );

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
    .eq(
      'user_id',
      userId
    )
    .eq(
      'week_number',
      weekNumber
    )
    .eq(
      'completed',
      true
    );

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
// GENERATE GEMINI RESPONSE
//
// Retry strategy:
//
// Model 3.7
//   ↓ 503/429
// retry once
//   ↓ still failing
// Model 3.6
//   ↓ 503/429
// retry once
//   ↓ still failing
// Model 3.5
//
// This is much more reliable than depending on
// one model only.
// ============================================================

async function generateWithGemini(
  prompt: string
) {
  let lastError: any = null;

  for (
    let modelIndex = 0;
    modelIndex < GEMINI_MODELS.length;
    modelIndex++
  ) {
    const modelName =
      GEMINI_MODELS[
        modelIndex
      ];

    const model =
      genAI.getGenerativeModel({
        model: modelName,

        generationConfig: {
          responseMimeType:
            'application/json',
        },
      });

    // Try each model up to 2 times.
    for (
      let attempt = 1;
      attempt <= 2;
      attempt++
    ) {
      try {
        console.log(
          `Gemini request: ${modelName}, attempt ${attempt}`
        );

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
            'Gemini returned an empty response'
          );
        }

        console.log(
          `Gemini success: ${modelName}`
        );

        return {
          model: modelName,
          text,
        };
      } catch (error: any) {
        lastError = error;

        console.error(
          `Gemini error [${modelName}] attempt ${attempt}:`,
          error
        );

        const retryable =
          isRetryableGeminiError(
            error
          );

        // If the error is not temporary,
        // don't waste time trying other models.
        if (!retryable) {
          throw error;
        }

        // Wait before retrying.
        if (attempt === 1) {
          await sleep(1500);
        }
      }
    }

    // Move to next model.
    console.log(
      `Switching Gemini model from ${modelName}`
    );

    // Small delay before fallback.
    await sleep(500);
  }

  throw (
    lastError ||
    new Error(
      'All Gemini models failed'
    )
  );
}

// ============================================================
// PARSE GEMINI JSON
// ============================================================

function parseGeminiJSON(
  responseText: string
) {
  let cleaned =
    responseText.trim();

  // Remove markdown JSON fences
  cleaned =
    cleaned
      .replace(
        /^```json\s*/i,
        ''
      )
      .replace(
        /^```\s*/i,
        ''
      )
      .replace(
        /\s*```$/i,
        ''
      )
      .trim();

  try {
    return JSON.parse(
      cleaned
    );
  } catch {
    // Fallback:
    // Find first { and last }
    const first =
      cleaned.indexOf('{');

    const last =
      cleaned.lastIndexOf('}');

    if (
      first !== -1 &&
      last !== -1 &&
      last > first
    ) {
      const possibleJSON =
        cleaned.slice(
          first,
          last + 1
        );

      return JSON.parse(
        possibleJSON
      );
    }

    throw new Error(
      'Gemini returned invalid JSON'
    );
  }
}

// ============================================================
// VALIDATE AI OUTPUT
// ============================================================

function validateAIOutput(
  output: any
) {
  if (
    !output ||
    typeof output !== 'object'
  ) {
    throw new Error(
      'AI output is not an object'
    );
  }

  if (
    typeof output.ai_analysis !==
    'string'
  ) {
    throw new Error(
      'AI output missing ai_analysis'
    );
  }

  if (
    !output.workout ||
    typeof output.workout !==
      'object'
  ) {
    throw new Error(
      'AI output missing workout'
    );
  }

  if (
    !output.diet ||
    typeof output.diet !==
      'object'
  ) {
    throw new Error(
      'AI output missing diet'
    );
  }

  return output;
}

// ============================================================
// POST
// ============================================================

export async function POST(
  req: Request
) {
  try {
    // --------------------------------------------------------
    // 1. AUTHENTICATION
    // --------------------------------------------------------

    const { userId } =
      await auth();

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
    // 2. READ BODY
    // --------------------------------------------------------

    let body: any;

    try {
      body =
        await req.json();
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid JSON body',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // 3. VALIDATE
    // --------------------------------------------------------

    let checkin: CheckinRequest;

    try {
      checkin =
        validateRequest(
          body
        );
    } catch (
      error: any
    ) {
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
    // 4. GET PROFILE
    // --------------------------------------------------------

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
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
    // 5. GET ACTIVE WORKOUT
    // --------------------------------------------------------

    const {
      data: workoutPlan,
      error:
        workoutPlanError,
    } =
      await supabase
        .from(
          'workout_plans'
        )
        .select('*')
        .eq(
          'user_id',
          profile.id
        )
        .eq(
          'is_active',
          true
        )
        .order(
          'week_number',
          {
            ascending: false,
          }
        )
        .limit(1)
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
    // 6. GET ACTIVE DIET
    // --------------------------------------------------------

    const {
      data: dietPlan,
      error:
        dietPlanError,
    } =
      await supabase
        .from(
          'diet_plans'
        )
        .select('*')
        .eq(
          'user_id',
          profile.id
        )
        .eq(
          'is_active',
          true
        )
        .order(
          'week_number',
          {
            ascending: false,
          }
        )
        .limit(1)
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
    // 7. CURRENT WEEK
    // --------------------------------------------------------

    const currentWeek =
      workoutPlan.week_number;

    // --------------------------------------------------------
    // 8. ACTIVITY COUNTS
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
    // 9. BUILD PROMPT
    // --------------------------------------------------------

    const prompt =
      buildGeminiPrompt({
        profile,
        workoutPlan,
        dietPlan,
        currentWeek,
        workouts_completed,
        diet_completed,
        feedback:
          checkin,
      });

    // --------------------------------------------------------
    // 10. GEMINI
    // --------------------------------------------------------

    let geminiResult;

    try {
      geminiResult =
        await generateWithGemini(
          prompt
        );
    } catch (
      error: any
    ) {
      console.error(
        'All Gemini attempts failed:',
        error
      );

      return NextResponse.json(
        {
          error:
            'AI service is temporarily unavailable. Please try again in a few minutes.',
        },
        {
          status: 503,
        }
      );
    }

    console.log(
      'Gemini model used:',
      geminiResult.model
    );

    // --------------------------------------------------------
    // 11. PARSE JSON
    // --------------------------------------------------------

    let aiOutput: any;

    try {
      aiOutput =
        parseGeminiJSON(
          geminiResult.text
        );

      aiOutput =
        validateAIOutput(
          aiOutput
        );
    } catch (
      error: any
    ) {
      console.error(
        'Invalid Gemini output:',
        geminiResult.text
      );

      return NextResponse.json(
        {
          error:
            'AI returned an invalid plan. Please try again.',
        },
        {
          status: 502,
        }
      );
    }

    // --------------------------------------------------------
    // 12. SAVE EVERYTHING THROUGH RPC
    // --------------------------------------------------------

    const {
      data:
        transactionResult,
      error:
        transactionError,
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
            checkin.user_notes ??
            '',

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
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------------
    // 13. SUCCESS
    // --------------------------------------------------------

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

      ai_model:
        geminiResult.model,
    });
  } catch (
    error: any
  ) {
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
// GEMINI PROMPT
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

Your job is to generate the user's next 7-day personalized
workout and diet plan.

Generate Week ${
    currentWeek + 1
  }.

IMPORTANT:
The user wants practical, sustainable plans.
Do not make extreme recommendations.
Do not recommend unsafe training or extreme dieting.

USER PROFILE:
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

WEEKLY ADHERENCE:
- Workout days completed: ${workouts_completed}/7
- Diet days completed: ${diet_completed}/7

WEEKLY FEEDBACK:
- Current weight: ${feedback.weight_kg} kg
- Workout difficulty: ${feedback.workout_difficulty}
- Energy level: ${feedback.energy_rating}/5
- User notes: ${
    feedback.user_notes ||
    'None'
  }

ADAPTATION RULES:

1. Consider adherence before making major changes.

2. If workout difficulty is "Too Easy":
   - Increase difficulty gradually.
   - Prefer progressive overload,
     better exercise variations,
     controlled tempo,
     or small volume increases.
   - Do NOT suddenly double training volume.

3. If workout difficulty is "Too Hard":
   - Reduce volume or intensity.
   - Prefer easier variations.
   - Keep technique quality high.

4. If energy is below 3/5:
   - Reduce training stress.
   - Avoid aggressive progression.

5. If adherence is low:
   - Prefer a simpler and more achievable plan
     instead of simply increasing workload.

6. Respect the user's:
   - available equipment
   - budget
   - food preferences
   - previous plan structure

7. Workout sessions should remain practical
   and should generally stay around 30 minutes.

8. Diet should be practical, affordable,
   balanced and sustainable.

9. Do not make medical diagnoses.

10. Do not invent supplements as mandatory.

RETURN ONLY VALID JSON.

The JSON must have exactly this high-level structure:

{
  "ai_analysis": "3-4 sentence analysis of the week and what changed.",
  "workout": {
    "Monday": {
      "focus": "string",
      "duration_minutes": 30,
      "exercises": []
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
      "focus": "string",
      "duration_minutes": 30,
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

For workout exercises, include useful fields such as:
- name
- sets
- reps
- rest_seconds
- notes

Keep the output valid JSON.
Do not use markdown.
Do not put JSON inside code fences.
`;
}
