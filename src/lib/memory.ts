import { prisma } from "@/lib/db";
import { getOpenAI } from "@/lib/openai";
import type { Prisma } from "@/generated/prisma/client";

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
  const profile = (user?.profile ?? {}) as Record<string, unknown>;
  return {
    profile,
    summary: user?.summary ?? "",
  };
}

export async function updateMemory(userId: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const current = await getUserMemory(userId);
  const system = `You analyze short chat snippets to maintain a user memory for a supportive mental health companion.\n\nReturn ONLY valid JSON with keys: profile (object of stable facts/preferences) and summary (a concise rolling summary of themes).\nBe conservative: only add facts when explicit. Keep a calm, empathetic tone in the summary.`;

  const userJson = JSON.stringify({ current, messages });

  const openai = getOpenAI();
  const resp = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    max_tokens: 400,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Update memory given the input:\n${userJson}\n\nReturn ONLY JSON.` },
    ],
  });

  const text = resp.choices?.[0]?.message?.content ?? "{}";
  let parsed: Memory | null = null;
  try {
    parsed = JSON.parse(text) as Memory;
  } catch {}
  if (!parsed) return current;

  await prisma.user.update({
    where: { id: userId },
    data: { profile: parsed.profile as Prisma.InputJsonValue, summary: parsed.summary },
  });
  return parsed;
}
