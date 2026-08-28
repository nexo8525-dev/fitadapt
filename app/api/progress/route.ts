import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('clerk_user_id', userId).maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    // Fetch everything concurrently for the user
    const [workouts, diets, workoutLogs, dietLogs, checkins] = await Promise.all([
      supabaseAdmin.from('workout_plans').select('*').eq('user_id', profile.id).order('week_number', { ascending: false }),
      supabaseAdmin.from('diet_plans').select('*').eq('user_id', profile.id).order('week_number', { ascending: false }),
      supabaseAdmin.from('workout_activity').select('*').eq('user_id', profile.id),
      supabaseAdmin.from('diet_activity').select('*').eq('user_id', profile.id),
      supabaseAdmin.from('weekly_checkins').select('*').eq('user_id', profile.id).order('week_number', { ascending: false }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        workoutPlans: workouts.data || [],
        dietPlans: diets.data || [],
        workoutLogs: workoutLogs.data || [],
        dietLogs: dietLogs.data || [],
        checkins: checkins.data || []
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
