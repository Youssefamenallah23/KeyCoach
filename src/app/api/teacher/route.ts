import { NextResponse } from 'next/server';

/**
 * AI teacher endpoint.
 *
 * The brief asks where an LLM is genuinely needed and how to keep latency and cost
 * under control. This route reflects those answers:
 *
 *  - Analysis and drill generation are NOT sent to a model. They are already
 *    deterministic and instant on the client (see `lib/coach.ts`).
 *  - The model is used only for language: explaining a mistake in words, or
 *    answering "why do I keep messing up this part".
 *  - With no API key configured, the route still answers, from the deterministic
 *    analyser. The feature never breaks, and costs nothing.
 *  - Output is capped (`maxOutputTokens`), the prompt is small (the learner state
 *    is a compact JSON summary, not raw attempts) and the request is stateless, so
 *    per-call cost is a few hundred tokens.
 *
 * Set one of these in `.env.local` to enable the model path:
 *   OPENAI_API_KEY  (optional OPENAI_MODEL, default gpt-4o-mini)
 *   GEMINI_API_KEY  (optional GEMINI_MODEL, default gemini-1.5-flash)
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface TeacherRequest {
  question?: string;
  learner?: {
    level?: number;
    recentAccuracy?: number | null;
    recommendedBpm?: number;
    weakNotes?: { label: string; errors: number; plays: number }[];
    weakTransitions?: { label: string; errors: number; occurrences: number }[];
    currentLesson?: string | null;
  };
}

const MAX_QUESTION = 400;
const MAX_OUTPUT_TOKENS = 260;

function clampQuestion(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_QUESTION);
}

/* --------------------------------------------------------- deterministic */

function deterministicAnswer(question: string, learner: TeacherRequest['learner']): string {
  const q = question.toLowerCase();
  const transitions = learner?.weakTransitions ?? [];
  const notes = learner?.weakNotes ?? [];
  const worst = transitions[0];
  const bpm = learner?.recommendedBpm ?? 70;

  const opening =
    worst !== undefined
      ? `Your most repeated mistake is ${worst.label}, ${worst.errors} of ${worst.occurrences} attempts.`
      : notes.length > 0
        ? `${notes[0].label} is your weakest note, ${notes[0].errors} errors in ${notes[0].plays} plays.`
        : 'There is not enough attempt data yet, so here is the general advice for this.';

  if (/timing|rhythm|late|early|metronome|rush|slow/.test(q)) {
    return [
      opening,
      `Timing is a tempo problem, not a finger problem. Drop to ${bpm} BPM and play with the metronome until three clean passes, then raise by 8 BPM. Raising tempo before the movement is automatic only teaches you to play it badly faster.`,
    ].join(' ');
  }

  if (/why|stuck|keep|again|always|cannot|can't|can not/.test(q)) {
    return [
      opening,
      `Repeating the same failure usually means the passage sits above your current tempo. Isolate the two notes, play them ten times at ${Math.max(50, bpm - 20)} BPM, then rejoin them to the phrase. Do not practise the whole piece to fix two notes.`,
    ].join(' ');
  }

  if (/chord|both hands|left hand|two hand|polyphon/.test(q)) {
    return [
      'Chords and two hands are out of reach on a computer keyboard. That is a hardware limit, not a skill limit.',
      'Most membrane keyboards cannot report three keys at once, and nothing plays one hand quietly while the other moves. Practise the parts separately here: right hand for melody, the bottom row for bass. Add the second hand when you reach a real instrument.',
    ].join(' ');
  }

  if (/wrong|which key|hunt|find|remember/.test(q)) {
    return [
      opening,
      'Then slow down and read the highlighted key before pressing. The note strip shows the note name, its beat, and the legend printed on your own key, so you can read it instead of hunting. Speed returns on its own once the movement is automatic.',
    ].join(' ');
  }

  return [
    opening,
    `Practise in this order: the two failing notes alone, then the phrase around them, then the whole exercise at ${bpm} BPM. Short correct repetitions beat long sloppy ones.`,
  ].join(' ');
}

/* ------------------------------------------------------------- providers */

interface Provider {
  id: 'openai' | 'gemini';
  run: (system: string, user: string) => Promise<string>;
}

function systemPrompt(): string {
  return [
    'You are a piano teacher for a learner who has no piano and practises on a computer keyboard.',
    'Answer in under 120 words. Be concrete and specific to the numbers given.',
    'Do not flatter, do not add pleasantries, do not use em dashes, do not invent facts about the learner.',
    'Never claim a keyboard can teach touch, dynamics, fingering or pedalling.',
    'If asked for something a keyboard cannot do, say so plainly and give the closest useful practice.',
  ].join(' ');
}

function userPrompt(question: string, learner: TeacherRequest['learner']): string {
  return [
    `Learner state (JSON): ${JSON.stringify(learner ?? {})}`,
    `Question: ${question || 'What should I practise next?'}`,
  ].join('\n');
}

function pickProvider(): Provider | null {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    return {
      id: 'openai',
      run: async (system, user) => {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${openaiKey}`,
          },
          body: JSON.stringify({
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            temperature: 0.4,
            messages: [
              { role: 'system', content: system },
              { role: 'user', content: user },
            ],
          }),
        });
        if (!res.ok) throw new Error(`OpenAI ${res.status}`);
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('OpenAI returned no content');
        return text.trim();
      },
    };
  }

  const geminiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    const model = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
    return {
      id: 'gemini',
      run: async (system, user) => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: 'user', parts: [{ text: user }] }],
              generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
            }),
          },
        );
        if (!res.ok) throw new Error(`Gemini ${res.status}`);
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
        if (!text) throw new Error('Gemini returned no content');
        return text.trim();
      },
    };
  }

  return null;
}

/* ----------------------------------------------------------------- route */

export async function POST(request: Request) {
  let body: TeacherRequest = {};
  try {
    body = (await request.json()) as TeacherRequest;
  } catch {
    body = {};
  }

  const question = clampQuestion(body.question);
  const learner = body.learner ?? {};
  const local = deterministicAnswer(question, learner);

  const provider = pickProvider();
  if (!provider) {
    return NextResponse.json({ answer: local, source: 'local' });
  }

  try {
    const answer = await provider.run(systemPrompt(), userPrompt(question, learner));
    return NextResponse.json({ answer, source: provider.id });
  } catch (error) {
    // A failed model call must never remove the feature.
    return NextResponse.json({
      answer: local,
      source: 'local',
      note: `Model call failed (${
        error instanceof Error ? error.message : 'unknown'
      }), answered locally instead.`,
    });
  }
}

export function GET() {
  const provider = pickProvider();
  return NextResponse.json({
    enabled: provider !== null,
    provider: provider?.id ?? 'local',
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
}