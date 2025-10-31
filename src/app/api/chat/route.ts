import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOpenAI } from "@/lib/openai";
import { prisma } from "@/lib/db";
import { getOrCreateConversation, getOrCreateUser, getUserMemory, updateMemory } from "@/lib/memory";

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const anonId = cookieStore.get("anonId")?.value ?? crypto.randomUUID();
    await getOrCreateUser(anonId);
    const conversation = await getOrCreateConversation(anonId);

    const memory = await getUserMemory(anonId);

    const system = `You are Mindful, a compassionate therapist AI providing supportive, evidence-based guidance.

Style:
- Warm, validating, and professional. Use reflective listening, summarize briefly, and vary wording; avoid repeating earlier phrases.
- Keep replies natural and concise (1–3 short paragraphs or a few bullets). When helpful, ask at most one open-ended, therapeutic question.
- Use evidence-based techniques (CBT, ACT, mindfulness, behavioral activation), offer gentle psychoeducation, and suggest simple, optional exercises or next steps.
- You are a therapist AI, but not a substitute for in-person care; avoid formal diagnoses and prescriptions.
- If self-harm, harm to others, or crisis is mentioned, respond compassionately and encourage immediate help (e.g., local emergency number, trusted contacts, or crisis hotlines).

User memory (may be incomplete):
Profile: ${JSON.stringify(memory.profile)}
Summary: ${memory.summary}`;

    // Save user message
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message.trim(),
      },
    });

    // Load recent history to provide context and reduce repetition
    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
      take: 24,
    });

    const chatMessages = history.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    // Lightweight style examples to encourage natural conversational tone
    const styleExamples = [
      { role: "user" as const, content: "I feel overwhelmed lately." },
      { role: "assistant" as const, content: "That sounds really heavy. When stress piles up, it can feel suffocating. If you’d like, what’s felt most demanding this week? One small next step could be a 2‑minute breathing reset before the hardest task." },
      { role: "user" as const, content: "I'm anxious about work." },
      { role: "assistant" as const, content: "Work anxiety can be draining. Minds often jump to worst‑case predictions. Would it help to name the top worry and one piece of evidence for and against it? We can also plan one specific action for tomorrow." },
    ];

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      max_tokens: 900,
      temperature: 0.85,
      top_p: 0.95,
      presence_penalty: 0.7,
      frequency_penalty: 0.7,
      messages: [{ role: "system", content: system }, ...styleExamples, ...chatMessages],
    });

    const reply = completion.choices?.[0]?.message?.content || "I'm here with you. Could you share a bit more?";

    // Save assistant reply
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: reply,
      },
    });

    // Update memory asynchronously (do not block response)
    void updateMemory(anonId, [
      { role: "user", content: message.trim() },
      { role: "assistant", content: reply },
    ]);

    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
