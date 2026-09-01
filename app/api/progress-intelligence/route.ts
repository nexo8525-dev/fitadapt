import { auth } from '@clerk/nextjs/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const geminiApiKey = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(geminiApiKey);

const GEMINI_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

function cleanJson(text: string): string {
  return text.replace(/```json/gi, '').replace(/```/g, '').trim();
}

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { exerciseStats, dietStats, checkins } = await req.json();

    // Force the AI to act strictly as a data analyst. No generic motivation allowed.
    const prompt = `
You are a strict data analyst for a fitness application. 
Analyze the provided user data and return exactly 3 to 5 highly specific, evidence-based insights.

RULES:
1. DO NOT invent or assume any progress.
2. DO NOT output generic motivational phrases (e.g., "Keep going!", "You're doing great!").
3. EVERY insight must explicitly mention the numbers or data from the input.
4. If there is insufficient data (e.g., only 1 week of data), explicitly state that trends cannot be determined yet.

DATA:
Exercise Performance Trends (Averages by Week):
${JSON.stringify(exerciseStats)}

Diet Adherence & Swap/Skip Reasons:
${JSON.stringify(dietStats)}

Weekly Weight & Check-ins:
${JSON.stringify(checkins)}

OUTPUT FORMAT:
Return ONLY raw JSON in this exact structure without markdown fences:
{
  "insights": [
    {
      "category": "Performance" | "Diet" | "Consistency" | "Feedback",
      "insight": "Specific data-backed sentence (e.g., 'Your recorded Push-up performance increased from an average of 10 reps in Week 1 to 12 in Week 2.')",
      "trend": "positive" | "negative" | "neutral"
    }
  ]
}
`;

    let resultText = "";
    let success = false;

    for (const modelName of GEMINI_MODELS) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json' } });
        const result = await model.generateContent(prompt);
        resultText = result.response.text();
        success = true;
        break; 
      } catch (err) {
        console.error(`Intelligence API: Model ${modelName} failed`);
      }
    }

    if (!success) throw new Error("All AI models failed.");

    const parsedInsights = JSON.parse(cleanJson(resultText));
    return NextResponse.json({ success: true, insights: parsedInsights.insights });

  } catch (error: any) {
    console.error('Progress Intelligence API Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to analyze progress' }, { status: 500 });
  }
}
