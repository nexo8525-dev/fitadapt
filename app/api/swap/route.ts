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
const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-3.5-flash', 'gemini-3.6-flash'];

function extractJSON(text: string): any {
  try {
    let cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      cleaned = cleaned.substring(start, end + 1);
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Error. Raw AI Output:", text);
    throw new Error("AI did not return valid JSON");
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { type, planId, day, originalItemName, reasonCategory, reasonDetails, profileData, kbContext } = body;

    if (!type || !planId || !day || !originalItemName || !reasonCategory) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. STRICT AUTHORIZATION CHECK (Feature 13)
    const { data: profile } = await supabaseAdmin.from('profiles').select('id').eq('clerk_user_id', userId).single();
    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const table = type === 'workout' ? 'workout_plans' : 'diet_plans';
    const { data: currentPlan, error: fetchError } = await supabaseAdmin
      .from(table).select('user_id, modifications').eq('id', planId).single();
      
    if (fetchError || !currentPlan) throw new Error("Plan not found");
    if (currentPlan.user_id !== profile.id) return NextResponse.json({ error: 'Forbidden. You do not own this plan.' }, { status: 403 });

    // 2. AI GENERATION
    const combinedReason = `${reasonCategory}${reasonDetails ? ` - Details: ${reasonDetails}` : ''}`;
    let prompt = `You are an expert AI fitness/nutrition coach. The user requested an item swap in their current plan.
Reason Category: "${reasonCategory}"
Additional Details: "${reasonDetails || 'None'}"
User Profile Context: ${JSON.stringify(profileData)}

CRITICAL SAFETY RULES:
- If "Pain/discomfort", DO NOT attempt medical diagnosis. Provide a gentle regression or state to skip.
- Respect existing constraints.
`;

    if (type === 'workout') {
      prompt += `Original: "${originalItemName}"\n${kbContext ? `Safe KB Options: ${JSON.stringify(kbContext)}` : ''}\nProvide 1 alternative in raw JSON format: { "name": "string", "sets": "string", "reps": "string", "rest_seconds": "string", "notes": "string" }`;
    } else {
      prompt += `Original: "${originalItemName}"\n${kbContext ? `Safe KB Options: ${JSON.stringify(kbContext)}` : ''}\nProvide 1 alternative in raw JSON format: { "meal": "string", "calories": number, "protein_g": number, "ingredients": "string" }`;
    }

    let resultText = "";
    let success = false;
    for (const modelName of GEMINI_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });
        const result = await model.generateContent(prompt);
        resultText = result.response.text();
        success = true; break; 
      } catch (err) { console.error(`Swap API: Model ${modelName} failed`); }
    }

    if (!success) throw new Error("AI failed to generate a response. Please try again.");
    const replacementData = extractJSON(resultText);

    // 3. DATABASE UPDATE
    const currentMods = currentPlan.modifications || {};
    if (!currentMods[day]) currentMods[day] = {};
    
    currentMods[day][originalItemName] = { ...replacementData, swapped_at: new Date().toISOString(), reason: combinedReason };

    const { error: updateError } = await supabaseAdmin.from(table).update({ modifications: currentMods }).eq('id', planId);
    if (updateError) throw updateError;

    return NextResponse.json({ success: true, replacement: replacementData });
  } catch (error: any) {
    console.error('Swap API Error:', error);
    return NextResponse.json({ error: 'Failed to process swap. Please try again.' }, { status: 500 });
  }
}
