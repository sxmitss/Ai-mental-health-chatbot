import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { anthropic } from "@/lib/anthropic";
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
- Warm, empathetic, and concise (1–3 short paragraphs or a few bullets).
- Reflect the user's feelings in your own words. Vary phrasing; avoid repeating the same sentences across turns.
- Ask at most one gentle, open-ended question when it helps.
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
      take: 16,
    });

    const chatMessages = history.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

    const completion = await anthropic.messages.create({
      model: "claude-3.5-sonnet-latest",
      max_tokens: 900,
      temperature: 0.7,
      top_p: 0.9,
      system,
      messages: chatMessages,
    });

    const reply = completion.content?.[0]?.type === "text" ? completion.content[0].text : "I'm here with you. Could you share a bit more?";

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
