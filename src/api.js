// Слой доступа к Apps Script Web App API.
// Пока VITE_API_URL не задан в .env — все функции возвращают моки из data/words.js,
// так что приложение продолжает работать и без бэкенда.

import { WORDS as MOCK_WORDS, LEVELS as MOCK_LEVELS } from "./data/words.js";

const API_URL = import.meta.env.VITE_API_URL || "";

function getInitData() {
  return window.Telegram?.WebApp?.initData || "";
}

async function apiGet(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

async function apiPost(body) {
  const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(body) });
  return res.json();
}

export const hasApi = Boolean(API_URL);

export async function getCurrentUser() {
  if (!hasApi) return { user_id: "demo", username: "denis", level: "", xp: 1240, streak: 7 };
  return apiGet("user", { init_data: getInitData() });
}

// Слова без привязки к юзеру (без персонального stage/decay) — нужно для
// placement-теста (1.3) и для повтора конкретной темы из "Пути" (1.4).
export async function getWords({ level, topic } = {}) {
  if (!hasApi) {
    let list = MOCK_WORDS;
    if (level) list = list.filter((w) => w.level === level);
    if (topic) list = list.filter((w) => w.topic === topic);
    return { words: list };
  }
  return apiGet("words", { level, topic });
}

export async function getDictionary({ query, level } = {}) {
  if (!hasApi) return { words: MOCK_WORDS };
  const user = await getCurrentUser();
  return apiGet("dictionary", { user_id: user.user_id, query, level });
}

export async function getQueue(count = 10) {
  if (!hasApi) return { queue: [] };
  const user = await getCurrentUser();
  return apiGet("queue", { user_id: user.user_id, count });
}

export async function getPath() {
  if (!hasApi) return { topics: MOCK_LEVELS.flatMap((l) => l.topics.map((t) => ({ ...t, level: l.level, total: t.count, mastered: t.status === "done" ? t.count : 0 }))) };
  const user = await getCurrentUser();
  return apiGet("path", { user_id: user.user_id });
}

export async function submitAnswer(wordId, correct) {
  if (!hasApi) return { wordId, stage: 0 };
  const user = await getCurrentUser();
  return apiPost({ action: "submitAnswer", user_id: user.user_id, word_id: wordId, correct });
}

// Сохраняет уровень, подтверждённый placement-тестом (1.3).
export async function setUserLevel(level) {
  if (!hasApi) return { ok: true, level };
  const user = await getCurrentUser();
  return apiPost({ action: "setUserLevel", user_id: user.user_id, level });
}

// 1.1 — лимиты подсказок.
export async function getHintStatus() {
  if (!hasApi) return { used: 0, limit: 3, remaining: 3, tier: "free" };
  const user = await getCurrentUser();
  return apiGet("hintStatus", { user_id: user.user_id });
}

export async function useHint() {
  if (!hasApi) return { allowed: true, remaining: 2, excludeFromStats: false };
  const user = await getCurrentUser();
  return apiPost({ action: "useHint", user_id: user.user_id });
}

export async function grantAdHint() {
  if (!hasApi) return { ok: true };
  const user = await getCurrentUser();
  return apiPost({ action: "grantAdHint", user_id: user.user_id });
}
