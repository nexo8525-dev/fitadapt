import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const geminiApiKey = process.env.GEMINI_API_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const genAI = new GoogleGenerativeAI(geminiApiKey);

// Helper function to clean markdown JSON fences
function cleanJson(text: string): string {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { type, planId, day, originalItemName, reason, profileData } = body;

    if (!type || !planId || !day || !originalItemName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash', generationConfig: { responseMimeType: 'application/json' } });
    
    let prompt = `You are an expert AI fitness/nutrition coach. The user wants to swap an item in their current plan.
Reason for swap: "${reason || 'Needs a different option'}"
User Profile Context: ${JSON.stringify(profileData)}

`;

    if (type === 'workout') {
      prompt += `Original Exercise: "${originalItemName}"
Provide 1 suitable alternative exercise that targets similar muscles but accommodates the user's reason.
Return ONLY raw JSON (no markdown) in this format: { "name": "string", "sets": "string", "reps": "string", "rest_seconds": "string", "notes": "string" }`;
    } else {
      prompt += `Original Meal: "${originalItemName}"
Provide 1 suitable alternative meal that accommodates the user's reason (e.g. food unavailable/disliked) keeping macros similar.
Return ONLY raw JSON (no markdown) in this format: { "meal": "string", "calories": number, "protein_g": number, "ingredients": "string" }`;
    }

    const result = await model.generateContent(prompt);
    
    // Clean the text before parsing
    const rawText = result.response.text();
    const replacementData = JSON.parse(cleanJson(rawText));

    const table = type === 'workout' ? 'workout_plans' : 'diet_plans';
    
    const { data: currentPlan, error: fetchError } = await supabaseAdmin
      .from(table).select('modifications').eq('id', planId).single();
      
    if (fetchError) throw fetchError;

    const currentMods = currentPlan.modifications || {};
    if (!currentMods[day]) currentMods[day] = {};
    
    currentMods[day][originalItemName] = {
      ...replacementData,
      swapped_at: new Date().toISOString(),
      reason: reason
    };

    const { error: updateError } = await supabaseAdmin
      .from(table).update({ modifications: currentMods }).eq('id', planId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, replacement: replacementData });
  } catch (error: any) {
    console.error('Swap API Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to process swap' }, { status: 500 });
  }
}
