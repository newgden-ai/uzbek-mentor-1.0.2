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
  if (!hasApi) return { user_id: "demo", username: "denis", level: "", xp: 1240, streak: 7, weekActivity: [true, true, true, true, true, true, true] };
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

export async function getQueue(count = 10, mode = "all") {
  if (!hasApi) return { queue: [] };
  const user = await getCurrentUser();
  return apiGet("queue", { user_id: user.user_id, count, mode });
}

// 1.6 — отмечает слово как показанное на карточке изучения (до упражнений).
export async function introduceWord(wordId) {
  if (!hasApi) return { ok: true };
  const user = await getCurrentUser();
  return apiPost({ action: "introduceWord", user_id: user.user_id, word_id: wordId });
}

export async function getPath() {
  if (!hasApi) return { topics: MOCK_LEVELS.flatMap((l) => l.topics.map((t) => ({ ...t, level: l.level, total: t.count, mastered: t.status === "done" ? t.count : 0 }))) };
  const user = await getCurrentUser();
  return apiGet("path", { user_id: user.user_id });
}

// ---------------------------------------------------------------------------
// 4 — submitAnswer раньше был чистым fire-and-forget: TrainerScreen вызывает
// его без await/catch, и при сетевой ошибке (нет связи, Apps Script не ответил)
// ответ молча пропадал — unhandled promise rejection, а SRS-баллы слова и
// daily_activity (см. 3) на бэкенде не обновлялись, хотя пользователь видел,
// что упражнение "прошло" и сессия ехала дальше.
//
// Не блокируем UI (это осознанный выбор — не тормозить сессию ожиданием сети),
// но теперь при неудаче ответ кладётся в очередь в localStorage (переживает
// перезагрузку/закрытие мини-аппа) и дожимается при следующем вызове
// submitAnswer и при восстановлении соединения (событие online).
// ---------------------------------------------------------------------------
const PENDING_ANSWERS_KEY = "um_pending_answers";

function readPendingAnswers() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_ANSWERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writePendingAnswers(list) {
  try {
    localStorage.setItem(PENDING_ANSWERS_KEY, JSON.stringify(list));
  } catch {
    // localStorage недоступен (приватный режим/квота) — очередь не сохранится
    // между перезагрузками, но текущая попытка отправки всё равно случится.
  }
}

async function sendAnswer(entry) {
  const user = await getCurrentUser();
  const res = await apiPost({ action: "submitAnswer", user_id: user.user_id, word_id: entry.wordId, correct: entry.correct });
  if (res && res.error) throw new Error(res.error);
  return res;
}

let flushInFlight = false;
export async function flushPendingAnswers() {
  if (flushInFlight) return;
  const pending = readPendingAnswers();
  if (pending.length === 0) return;
  flushInFlight = true;
  try {
    const remaining = [];
    // Отправляем по очереди (не параллельно) — так порядок ответов на бэкенде
    // совпадает с тем, в каком пользователь их реально давал.
    for (const entry of pending) {
      try {
        await sendAnswer(entry);
      } catch {
        remaining.push(entry); // всё ещё нет связи — оставляем в очереди
      }
    }
    writePendingAnswers(remaining);
  } finally {
    flushInFlight = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { flushPendingAnswers(); });
}

export async function submitAnswer(wordId, correct) {
  if (!hasApi) return { wordId, stage: 0 };

  flushPendingAnswers(); // попутно, не блокируя — дожимаем то, что скопилось раньше

  const entry = { wordId, correct, ts: Date.now() };
  try {
    return await sendAnswer(entry);
  } catch (err) {
    const pending = readPendingAnswers();
    pending.push(entry);
    writePendingAnswers(pending);
    return { queued: true, error: String(err.message || err) };
  }
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

// 1 — сводная статистика для системы достижений (Прогресс).
export async function getStats() {
  if (!hasApi) {
    return {
      tasksDone: 1084, mistakesTotal: 141, mistakesStreakMax: 6,
      streak: 7, maxStreak: 12, wordsStarted: 340, wordsMastered: 312,
      hoursActive: [9, 13, 21, 22, 23], weekdaysActive: [1, 2, 3, 4, 5, 6, 0],
      tier: "free", level: "A1",
    };
  }
  const user = await getCurrentUser();
  return apiGet("stats", { user_id: user.user_id });
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

// Погашение промокода на premium/tester.
export async function redeemCode(code) {
  if (!hasApi) return { ok: true, tier: "premium" };
  const user = await getCurrentUser();
  return apiPost({ action: "redeemPromoCode", user_id: user.user_id, code });
}

// 2.2 — свободный перевод текста (не привязан к нашей базе слов).
export async function translateText(text, sourceLang = "ru", targetLang = "uz") {
  if (!hasApi) return { translated: `[демо] ${text}` };
  return apiGet("translate", { text, sl: sourceLang, tl: targetLang });
}

// 2.2 — похожие по написанию слова В НАШЕЙ базе.
export async function getSimilarWords(query, limit = 8) {
  if (!hasApi) return { words: [] };
  return apiGet("similarWords", { query, limit });
}
