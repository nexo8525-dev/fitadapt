import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

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
// GET
// Fetch user's workout + diet activity logs
// ============================================================

export async function GET() {
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
    // 2. Get profile
    // --------------------------------------------------------

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('clerk_user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error(
        'Logs profile error:',
        profileError
      );

      return NextResponse.json(
        {
          error: 'Failed to fetch profile',
        },
        {
          status: 500,
        }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          error: 'Profile not found',
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------------
    // 3. Fetch workout + diet logs
    // --------------------------------------------------------

    const [
      workoutResult,
      dietResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('workout_activity')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', {
          ascending: false,
        }),

      supabaseAdmin
        .from('diet_activity')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', {
          ascending: false,
        }),
    ]);

    if (workoutResult.error) {
      console.error(
        'Workout logs error:',
        workoutResult.error
      );

      return NextResponse.json(
        {
          error: 'Failed to fetch workout logs',
        },
        {
          status: 500,
        }
      );
    }

    if (dietResult.error) {
      console.error(
        'Diet logs error:',
        dietResult.error
      );

      return NextResponse.json(
        {
          error: 'Failed to fetch diet logs',
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------------
    // 4. Return logs
    // --------------------------------------------------------

    return NextResponse.json({
      success: true,

      workoutLogs:
        workoutResult.data ?? [],

      dietLogs:
        dietResult.data ?? [],
    });
  } catch (error: any) {
    console.error(
      'Logs GET error:',
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
// POST
// Create/update workout or diet completion log
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
    // 2. Read request body
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

    const {
      type,
      day,
      week_number,
      completed,
    } = body;

    // --------------------------------------------------------
    // 3. Validate
    // --------------------------------------------------------

    if (
      type !== 'workout' &&
      type !== 'diet'
    ) {
      return NextResponse.json(
        {
          error:
            'type must be workout or diet',
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof day !== 'string' ||
      !day.trim()
    ) {
      return NextResponse.json(
        {
          error: 'day is required',
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof week_number !== 'number' ||
      !Number.isInteger(week_number) ||
      week_number < 1
    ) {
      return NextResponse.json(
        {
          error:
            'week_number must be a positive integer',
        },
        {
          status: 400,
        }
      );
    }

    if (
      typeof completed !== 'boolean'
    ) {
      return NextResponse.json(
        {
          error:
            'completed must be boolean',
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------------------------
    // 4. Get profile
    // --------------------------------------------------------

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('clerk_user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error(
        'Logs profile error:',
        profileError
      );

      return NextResponse.json(
        {
          error: 'Failed to fetch profile',
        },
        {
          status: 500,
        }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          error: 'Profile not found',
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------------
    // 5. Select correct table
    // --------------------------------------------------------

    const table =
      type === 'workout'
        ? 'workout_activity'
        : 'diet_activity';

    // --------------------------------------------------------
    // 6. Find existing log
    // --------------------------------------------------------

    const {
      data: existing,
      error: existingError,
    } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('user_id', profile.id)
      .eq('week_number', week_number)
      .eq('day', day)
      .maybeSingle();

    if (existingError) {
      console.error(
        'Existing log error:',
        existingError
      );

      return NextResponse.json(
        {
          error:
            'Failed to check existing log',
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------------
    // 7. Update existing log
    // --------------------------------------------------------

    if (existing) {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from(table)
        .update({
          completed,
          completed_at: completed
            ? new Date().toISOString()
            : null,
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        console.error(
          'Log update error:',
          error
        );

        return NextResponse.json(
          {
            error:
              'Failed to update log',
          },
          {
            status: 500,
          }
        );
      }

      return NextResponse.json({
        success: true,
        action: 'updated',
        log: data,
      });
    }

    // --------------------------------------------------------
    // 8. Get active plan ID
    // --------------------------------------------------------

    const planTable =
      type === 'workout'
        ? 'workout_plans'
        : 'diet_plans';

    const {
      data: plan,
      error: planError,
    } = await supabaseAdmin
      .from(planTable)
      .select('id')
      .eq('user_id', profile.id)
      .eq('week_number', week_number)
      .eq('is_active', true)
      .maybeSingle();

    if (planError) {
      console.error(
        'Plan lookup error:',
        planError
      );

      return NextResponse.json(
        {
          error:
            'Failed to fetch active plan',
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------------
    // 9. Create log
    // --------------------------------------------------------

    const insertData =
      type === 'workout'
        ? {
            user_id: profile.id,
            workout_plan_id:
              plan?.id ?? null,
            week_number,
            day,
            completed,
            completed_at: completed
              ? new Date().toISOString()
              : null,
          }
        : {
            user_id: profile.id,
            diet_plan_id:
              plan?.id ?? null,
            week_number,
            day,
            completed,
            completed_at: completed
              ? new Date().toISOString()
              : null,
          };

    const {
      data,
      error,
    } = await supabaseAdmin
      .from(table)
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error(
        'Log insert error:',
        error
      );

      return NextResponse.json(
        {
          error:
            'Failed to create log',
        },
        {
          status: 500,
        }
      );
    }

    // --------------------------------------------------------
    // 10. Return
    // --------------------------------------------------------

    return NextResponse.json(
      {
        success: true,
        action: 'created',
        log: data,
      },
      {
        status: 201,
      }
    );
  } catch (error: any) {
    console.error(
      'Logs POST error:',
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
