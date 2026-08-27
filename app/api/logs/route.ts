import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Supabase environment variables are missing');
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET() {
  // GET method remains EXACTLY the same as your current code
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('clerk_user_id', userId).maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const [workoutResult, dietResult] = await Promise.all([
      supabaseAdmin.from('workout_activity').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
      supabaseAdmin.from('diet_activity').select('*').eq('user_id', profile.id).order('created_at', { ascending: false }),
    ]);

    return NextResponse.json({
      success: true,
      workoutLogs: workoutResult.data ?? [],
      dietLogs: dietResult.data ?? [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    
    // NEW: We now accept tracking_data from the frontend
    const { type, day, week_number, completed, tracking_data } = body;

    if (type !== 'workout' && type !== 'diet') {
      return NextResponse.json({ error: 'type must be workout or diet' }, { status: 400 });
    }
    if (typeof day !== 'string' || !day.trim()) {
      return NextResponse.json({ error: 'day is required' }, { status: 400 });
    }

    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('clerk_user_id', userId).maybeSingle();
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const table = type === 'workout' ? 'workout_activity' : 'diet_activity';
    const planTable = type === 'workout' ? 'workout_plans' : 'diet_plans';

    // Find existing log for this specific day and week
    const { data: existing } = await supabaseAdmin
      .from(table)
      .select('*')
      .eq('user_id', profile.id)
      .eq('week_number', week_number)
      .eq('day', day)
      .maybeSingle();

    if (existing) {
      // Update existing log with new tracking_data
      const { data, error } = await supabaseAdmin
        .from(table)
        .update({
          completed,
          completed_at: completed ? new Date().toISOString() : existing.completed_at,
          tracking_data: tracking_data || existing.tracking_data, // Preserve existing if none provided
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, action: 'updated', log: data });
    }

    // If no existing log, find the active plan ID
    const { data: plan } = await supabaseAdmin
      .from(planTable)
      .select('id')
      .eq('user_id', profile.id)
      .eq('week_number', week_number)
      .eq('is_active', true)
      .maybeSingle();

    // Insert new log
    const insertData = {
      user_id: profile.id,
      [type === 'workout' ? 'workout_plan_id' : 'diet_plan_id']: plan?.id ?? null,
      week_number,
      day,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
      tracking_data: tracking_data || {},
    };

    const { data, error } = await supabaseAdmin.from(table).insert(insertData).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, action: 'created', log: data }, { status: 201 });
  } catch (error: any) {
    console.error('Logs POST error:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
