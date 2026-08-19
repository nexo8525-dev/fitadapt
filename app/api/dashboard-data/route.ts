import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
}

if (!supabaseServiceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');
}

/*
 * SERVER ONLY
 *
 * Service Role Key must NEVER be exposed to the browser.
 */
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

export async function GET() {
  try {
    // ========================================================
    // 1. Clerk authentication
    // ========================================================

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

    // ========================================================
    // 2. Fetch profile
    // ========================================================

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('clerk_user_id', userId)
      .maybeSingle();

    if (profileError) {
      console.error(
        'Dashboard profile error:',
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

    /*
     * This is NOT an error.
     *
     * User may have signed in but not completed onboarding.
     */
    if (!profile) {
      return NextResponse.json({
        hasProfile: false,
        profile: null,
        workout: null,
        diet: null,
        workoutActivity: [],
        dietActivity: [],
        latestReview: null,
      });
    }

    // ========================================================
    // 3. Fetch active workout + diet + latest review
    // ========================================================

    const [
      workoutResult,
      dietResult,
      reviewResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('workout_plans')
        .select('*')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .order('week_number', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),

      supabaseAdmin
        .from('diet_plans')
        .select('*')
        .eq('user_id', profile.id)
        .eq('is_active', true)
        .order('week_number', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),

      supabaseAdmin
        .from('weekly_checkins')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
    ]);

    if (workoutResult.error) {
      console.error(
        'Dashboard workout error:',
        workoutResult.error
      );

      return NextResponse.json(
        {
          error: 'Failed to fetch workout plan',
        },
        {
          status: 500,
        }
      );
    }

    if (dietResult.error) {
      console.error(
        'Dashboard diet error:',
        dietResult.error
      );

      return NextResponse.json(
        {
          error: 'Failed to fetch diet plan',
        },
        {
          status: 500,
        }
      );
    }

    if (reviewResult.error) {
      console.error(
        'Dashboard review error:',
        reviewResult.error
      );

      return NextResponse.json(
        {
          error: 'Failed to fetch weekly review',
        },
        {
          status: 500,
        }
      );
    }

    const workout = workoutResult.data ?? null;
    const diet = dietResult.data ?? null;
    const latestReview =
      reviewResult.data ?? null;

    // ========================================================
    // 4. Determine current week
    // ========================================================

    const currentWeek =
      workout?.week_number ??
      diet?.week_number ??
      null;

    // ========================================================
    // 5. Fetch activities
    // ========================================================

    let workoutActivity: any[] = [];
    let dietActivity: any[] = [];

    if (currentWeek !== null) {
      const [
        workoutActivityResult,
        dietActivityResult,
      ] = await Promise.all([
        supabaseAdmin
          .from('workout_activity')
          .select('*')
          .eq('user_id', profile.id)
          .eq('week_number', currentWeek),

        supabaseAdmin
          .from('diet_activity')
          .select('*')
          .eq('user_id', profile.id)
          .eq('week_number', currentWeek),
      ]);

      if (workoutActivityResult.error) {
        console.error(
          'Workout activity error:',
          workoutActivityResult.error
        );

        return NextResponse.json(
          {
            error:
              'Failed to fetch workout activity',
          },
          {
            status: 500,
          }
        );
      }

      if (dietActivityResult.error) {
        console.error(
          'Diet activity error:',
          dietActivityResult.error
        );

        return NextResponse.json(
          {
            error:
              'Failed to fetch diet activity',
          },
          {
            status: 500,
          }
        );
      }

      workoutActivity =
        workoutActivityResult.data ?? [];

      dietActivity =
        dietActivityResult.data ?? [];
    }

    // ========================================================
    // 6. Return clean response
    // ========================================================

    return NextResponse.json({
      hasProfile: true,

      profile,

      workout,

      diet,

      workoutActivity,

      dietActivity,

      latestReview,
    });
  } catch (error: any) {
    console.error(
      'Dashboard API error:',
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
