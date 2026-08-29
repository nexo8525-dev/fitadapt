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

const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-1.5-flash'];

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

    let prompt = `You are an expert AI fitness/nutrition coach. The user wants to swap an item in their current plan.
Reason for swap: "${reason || 'Needs a different option'}"
User Profile Context: ${JSON.stringify(profileData)}

`;

    if (type === 'workout') {
      prompt += `Original Exercise: "${originalItemName}"
Provide 1 suitable alternative exercise that targets similar muscles but accommodates the user's reason.
Return ONLY raw JSON (no markdown fences) in this exact format: { "name": "string", "sets": "string", "reps": "string", "rest_seconds": "string", "notes": "string" }`;
    } else {
      prompt += `Original Meal: "${originalItemName}"
Provide 1 suitable alternative meal that accommodates the user's reason keeping macros similar.
Return ONLY raw JSON (no markdown fences) in this exact format: { "meal": "string", "calories": number, "protein_g": number, "ingredients": "string" }`;
    }

    let resultText = "";
    let success = false;

    // Fallback Logic
    for (const modelName of GEMINI_MODELS) {
      try {
        console.log(`Swap API: Trying model ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });
        const result = await model.generateContent(prompt);
        resultText = result.response.text();
        success = true;
        break; 
      } catch (err) {
        console.error(`Swap API: Model ${modelName} failed`);
      }
    }

    if (!success) throw new Error("All Gemini models failed to generate a response.");

    const replacementData = JSON.parse(cleanJson(resultText));

    const table = type === 'workout' ? 'workout_plans' : 'diet_plans';
    
    const { data: currentPlan, error: fetchError } = await supabaseAdmin
      .from(table).select('modifications').eq('id', planId).single();
      
    if (fetchError) {
      console.error("Supabase fetch error:", fetchError);
      throw fetchError;
    }

    const currentMods = currentPlan.modifications || {};
    if (!currentMods[day]) currentMods[day] = {};
    
    currentMods[day][originalItemName] = {
      ...replacementData,
      swapped_at: new Date().toISOString(),
      reason: reason
    };

    const { error: updateError } = await supabaseAdmin
      .from(table).update({ modifications: currentMods }).eq('id', planId);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      throw updateError;
    }

    return NextResponse.json({ success: true, replacement: replacementData });
  } catch (error: any) {
    console.error('Swap API Critical Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to process swap' }, { status: 500 });
  }
}
