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
  if (!hasApi) return { user_id: "demo", username: "denis", level: "A1.2", xp: 1240, streak: 7 };
  return apiGet("user", { init_data: getInitData() });
}

export async function getDictionary({ query, level } = {}) {
  if (!hasApi) return { words: MOCK_WORDS };
  const user = await getCurrentUser();
  return apiGet("dictionary", { user_id: user.user_id, query, level });
}

export async function getQueue(count = 10) {
  if (!hasApi) return { queue: [] }; // TrainerScreen пока использует свой демо-QUEUE
  const user = await getCurrentUser();
  return apiGet("queue", { user_id: user.user_id, count });
}

export async function getPath() {
  if (!hasApi) return { topics: MOCK_LEVELS.flatMap((l) => l.topics) };
  const user = await getCurrentUser();
  return apiGet("path", { user_id: user.user_id });
}

export async function submitAnswer(wordId, correct) {
  if (!hasApi) return { wordId, stage: 0 };
  const user = await getCurrentUser();
  return apiPost({ action: "submitAnswer", user_id: user.user_id, word_id: wordId, correct });
}
