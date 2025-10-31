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

    const system = `You are Mindful, a supportive mental health chat companion.\n\nGround rules:\n- You provide empathetic, non-judgmental support.\n- You are not a therapist and do not give medical advice or diagnoses.\n- Encourage seeking professional help when appropriate.\n- If the user mentions self-harm, harm to others, or a crisis, respond with compassion and encourage immediate help (e.g., local emergency number, trusted contacts, or crisis hotlines).\n\nUser memory (may be incomplete):\nProfile: ${JSON.stringify(memory.profile)}\nSummary: ${memory.summary}`;

    // Save user message
    const userMsg = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message.trim(),
      },
    });

    const completion = await anthropic.messages.create({
      model: "claude-3.5-sonnet-latest",
      max_tokens: 900,
      temperature: 0.4,
      system,
      messages: [
        { role: "user", content: message.trim() },
      ],
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
