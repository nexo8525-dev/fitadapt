import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// ============================================================
// Environment Variables
// ============================================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiApiKey = process.env.GEMINI_API_KEY;

// ============================================================
// Environment Validation
// ============================================================

if (!supabaseUrl) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL is not configured'
  );
}

if (!supabaseServiceRoleKey) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is not configured'
  );
}

if (!geminiApiKey) {
  throw new Error(
    'GEMINI_API_KEY is not configured'
  );
}

// ============================================================
// Supabase Server Client
// ============================================================

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey
);

// ============================================================
// Gemini
// ============================================================

const genAI = new GoogleGenerativeAI(
  geminiApiKey
);

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
});

// ============================================================
// Types
// ============================================================

interface CheckinRequest {
  weight_kg: number;
  workout_difficulty:
    | 'Too Easy'
    | 'Just Right'
    | 'Too Hard';
  energy_rating: number;
  user_notes?: string;
}

// ============================================================
// Validate Request
// ============================================================

function validateRequest(
  body: any
): CheckinRequest {
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

  if (
    ![
      'Too Easy',
      'Just Right',
      'Too Hard',
    ].includes(workout_difficulty)
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
// Count Completed Activities
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
      `Failed to fetch workout_activity: ${workoutError.message}`
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
      `Failed to fetch diet_activity: ${dietError.message}`
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
// POST /api/weekly-checkin
// ============================================================

export async function POST(
  req: Request
) {
  try {
    // --------------------------------------------------------
    // 1. Authentication
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
    // 2. Parse Request
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
    // 3. Validate Request
    // --------------------------------------------------------

    let checkinData: CheckinRequest;

    try {
      checkinData =
        validateRequest(body);
    } catch (error: any) {
      return NextResponse.json(
        {
          error:
            error.message ||
            'Invalid request',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // 4. Fetch Profile
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
      .single();

    if (
      profileError ||
      !profile
    ) {
      console.error(
        'Profile fetch error:',
        profileError
      );

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
    // 5. Fetch Active Workout Plan
    // --------------------------------------------------------

    const {
      data: workoutPlan,
      error: workoutError,
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

    if (workoutError) {
      console.error(
        'Workout plan error:',
        workoutError
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
    // 6. Fetch Active Diet Plan
    // --------------------------------------------------------

    const {
      data: dietPlan,
      error: dietError,
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

    if (dietError) {
      console.error(
        'Diet plan error:',
        dietError
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
    // 7. Current Week
    // --------------------------------------------------------

    const currentWeek =
      workoutPlan.week_number;

    // --------------------------------------------------------
    // 8. Count Completed Activities
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
    // 9. Build AI Prompt
    // --------------------------------------------------------

    const prompt =
      buildGeminiPrompt({
        profile,
        workoutPlan,
        dietPlan,
        currentWeek,
        workouts_completed,
        diet_completed,
        feedback: {
          weight_kg:
            checkinData.weight_kg,
          workout_difficulty:
            checkinData.workout_difficulty,
          energy_rating:
            checkinData.energy_rating,
          user_notes:
            checkinData.user_notes,
        },
      });

    // --------------------------------------------------------
    // 10. Gemini
    // --------------------------------------------------------

    const geminiResponse =
      await model.generateContent(
        prompt
      );

    const responseText =
      geminiResponse.response.text();

    // --------------------------------------------------------
    // 11. Parse AI JSON
    // --------------------------------------------------------

    let aiOutput: any;

    try {
      const jsonMatch =
        responseText.match(
          /```json\s*([\s\S]*?)\s*```/
        ) ||
        responseText.match(
          /(\{[\s\S]*\})/
        );

      const jsonString =
        jsonMatch?.[1] ??
        responseText;

      aiOutput =
        JSON.parse(jsonString);
    } catch (error) {
      console.error(
        'Gemini JSON parse error:',
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
    // 12. Validate AI Output
    // --------------------------------------------------------

    if (
      !aiOutput ||
      !aiOutput.ai_analysis ||
      !aiOutput.workout ||
      !aiOutput.diet
    ) {
      console.error(
        'Invalid AI output:',
        aiOutput
      );

      return NextResponse.json(
        {
          error:
            'AI response missing required fields',
        },
        {
          status: 502,
        }
      );
    }

    // --------------------------------------------------------
    // 13. Generate Next Week
    // --------------------------------------------------------

    const newWeek =
      currentWeek + 1;

    // --------------------------------------------------------
    // 14. Database Transaction
    // --------------------------------------------------------

    const {
      data: transactionResult,
      error: transactionError,
    } = await supabase.rpc(
      'generate_new_week_plans',
      {
        p_user_id:
          profile.id,

        p_week_number:
          currentWeek,

        p_weight_kg:
          checkinData.weight_kg,

        p_workout_difficulty:
          checkinData.workout_difficulty,

        p_energy_rating:
          checkinData.energy_rating,

        p_workouts_completed:
          workouts_completed,

        p_diet_completed:
          diet_completed,

        p_user_notes:
          checkinData.user_notes ||
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
        'Transaction error:',
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
    // 15. Success
    // --------------------------------------------------------

    return NextResponse.json({
      success: true,
      week_number: newWeek,
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
  const {
    profile,
    workoutPlan,
    dietPlan,
    currentWeek,
    workouts_completed,
    diet_completed,
    feedback,
  } = params;

  const {
    age,
    height_cm,
    initial_weight_kg,
    goal,
    equipment,
    diet_preference,
    budget,
  } = profile;

  const previousWorkout =
    workoutPlan.plan_data;

  const previousDiet =
    dietPlan.plan_data;

  const totalDays = 7;

  const workoutAdherence =
    `${workouts_completed}/${totalDays}`;

  const dietAdherence =
    `${diet_completed}/${totalDays}`;

  return `
You are an expert fitness and nutrition coach.

Generate a personalized plan for Week ${
    currentWeek + 1
  } based on the user's baseline, previous plan, adherence and feedback.

USER BASELINE:
- Age: ${age}
- Height: ${height_cm} cm
- Initial Weight: ${initial_weight_kg} kg
- Goal: ${goal}
- Available Equipment: ${equipment}
- Diet Preference: ${diet_preference}
- Budget: ${budget}

PREVIOUS WORKOUT PLAN:
${JSON.stringify(
  previousWorkout,
  null,
  2
)}

PREVIOUS DIET PLAN:
${JSON.stringify(
  previousDiet,
  null,
  2
)}

ACTUAL EXECUTION:
- Workouts completed: ${workoutAdherence}
- Diet days completed: ${dietAdherence}

USER FEEDBACK:
- Current Weight: ${feedback.weight_kg} kg
- Workout Difficulty: ${feedback.workout_difficulty}
- Energy: ${feedback.energy_rating}/5
- Notes: ${
    feedback.user_notes ||
    'None'
  }

COACHING RULES:

- Consider adherence before making major changes.
- If workout is Too Easy, apply progressive overload.
- If workout is Too Hard or energy is below 3, reduce volume or intensity.
- Make reasonable nutrition adjustments.
- Do not make extreme calorie changes.
- Respect available equipment and budget.
- Keep the plan practical and sustainable.
- Do not recommend unsafe practices.

OUTPUT:

Return ONLY valid JSON.

No markdown.
No code fences.
No text outside JSON.

{
  "ai_analysis": "3-4 sentence analysis.",
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
