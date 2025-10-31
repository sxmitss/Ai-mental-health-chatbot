import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { anthropic } from "@/lib/anthropic";

export type Memory = {
  profile: Record<string, unknown>;
  summary: string;
};

export async function getOrCreateUser(anonId: string) {
  let user = await prisma.user.findUnique({ where: { id: anonId } });
  if (!user) {
    user = await prisma.user.create({ data: { id: anonId } });
  }
  return user;
}

export async function getOrCreateConversation(userId: string) {
  const convo = await prisma.conversation.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (convo) return convo;
  return prisma.conversation.create({ data: { userId } });
}

export async function getUserMemory(userId: string): Promise<Memory> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return {
    profile: (user?.profile as any) ?? {},
    summary: user?.summary ?? "",
  };
}

export async function updateMemory(userId: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const current = await getUserMemory(userId);
  const system = `You analyze short chat snippets to maintain a user memory for a supportive mental health companion.\n\nReturn ONLY valid JSON with keys: profile (object of stable facts/preferences) and summary (a concise rolling summary of themes).\nBe conservative: only add facts when explicit. Keep a calm, empathetic tone in the summary.`;

  const userJson = JSON.stringify({ current, messages });

  const resp = await anthropic.messages.create({
    model: "claude-3.5-sonnet-latest",
    max_tokens: 400,
    temperature: 0.2,
    system,
    messages: [
      { role: "user", content: `Update memory given the input:\n${userJson}` },
    ],
  });

  const text = resp.content?.[0]?.type === "text" ? resp.content[0].text : "{}";
  let parsed: Memory | null = null;
  try {
    parsed = JSON.parse(text) as Memory;
  } catch {}
  if (!parsed) return current;

  await prisma.user.update({
    where: { id: userId },
    data: { profile: parsed.profile as any, summary: parsed.summary },
  });
  return parsed;
}
