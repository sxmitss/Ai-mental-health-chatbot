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

    const system = `You are Mindful, a supportive mental health chat companion.

Style:
- Warm, empathetic, and human. Vary word choice; avoid repeating phrases or sentences used earlier in this conversation.
- Keep replies natural and concise (1–3 short paragraphs or a few bullets) and ask at most one gentle, open-ended question when it helps.
- You are not a therapist; do not give medical advice or diagnoses.
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
      { role: "assistant" as const, content: "That sounds really heavy. When everything piles up, it can feel like there’s no room to breathe. What’s been weighing on you most today?" },
      { role: "user" as const, content: "I'm anxious about work." },
      { role: "assistant" as const, content: "Anxiety around work can be exhausting. I hear you. Is it a specific deadline, feedback, or uncertainty that’s triggering it right now?" },
    ];

    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      max_tokens: 900,
      temperature: 0.85,
      top_p: 0.95,
      presence_penalty: 0.6,
      frequency_penalty: 0.2,
      messages: [{ role: "system", content: system }, ...styleExamples, ...chatMessages],
    });

    const reply = completion.choices?.[0]?.message?.content || "I'm here with you. Could you share a bit more?";

    // Save assistant reply
    const assistantMsg = await prisma.message.create({
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
  } catch (e) {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
