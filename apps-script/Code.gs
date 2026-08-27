/**
 * Code.gs — Web App API для мини-аппа и бота.
 * Деплой: Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
 * Скопируй URL из деплоя и подставь в .env фронта как VITE_API_URL.
 */

const BOT_TOKEN = PropertiesService.getScriptProperties().getProperty("BOT_TOKEN");
// Стадия → через сколько дней следующий повтор (соответствует стадиям здания в UI)
const INTERVAL_DAYS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 14 };
const DECAY_AFTER_DAYS = 10; // после скольки дней без повтора здание начинает тускнеть
const DECAY_FULL_DAYS = 20; // к какому дню здание становится полностью чб

// 1.1 — дневные лимиты подсказок по тарифам. По выходным — база + половина базы.
const HINT_LIMITS = { free: 3, premium: 10, tester: Infinity };
function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}
function hintLimitFor(tier, date) {
  const base = HINT_LIMITS[tier] || HINT_LIMITS.free;
  if (base === Infinity) return Infinity;
  return isWeekend(date) ? Math.ceil(base * 1.5) : base;
}
function todayKey(date) {
  return Utilities.formatDate(date, "UTC", "yyyy-MM-dd");
}

// SpreadsheetApp.getActiveSpreadsheet() возвращает null и в вызовах через Web App
// (doGet/doPost), и иногда при запуске функции не из привязанного контекста —
// поэтому открываем таблицу явно по ID, сохранённому в свойствах скрипта.
function getSpreadsheet() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) {
    throw new Error(
      "Не задан SPREADSHEET_ID в свойствах скрипта. Настройки проекта → Свойства скрипта."
    );
  }
  return SpreadsheetApp.openById(id);
}

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case "words":
        result = getWords(e.parameter.level, e.parameter.topic);
        break;
      case "user":
        result = getOrCreateUser(e.parameter.init_data);
        break;
      case "queue":
        result = getQueue(e.parameter.user_id, Number(e.parameter.count) || 10);
        break;
      case "dictionary":
        result = getDictionary(e.parameter.user_id, e.parameter.query, e.parameter.level);
        break;
      case "path":
        result = getPath(e.parameter.user_id);
        break;
      case "hintStatus":
        result = getHintStatus(e.parameter.user_id);
        break;
      default:
        result = { error: "unknown action: " + action };
    }
    return jsonOutput(result);
  } catch (err) {
    return jsonOutput({ error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    let result;
    switch (body.action) {
      case "submitAnswer":
        result = submitAnswer(body.user_id, body.word_id, body.correct);
        break;
      case "adminAddWord":
        result = adminAddWord(body.admin_user_id, body.word);
        break;
      case "setUserLevel":
        result = setUserLevel(body.user_id, body.level);
        break;
      case "useHint":
        result = useHint(body.user_id);
        break;
      case "grantAdHint":
        result = grantAdHint(body.user_id);
        break;
      case "redeemPromoCode":
        result = redeemPromoCode(body.user_id, body.code);
        break;
      default:
        result = { error: "unknown action: " + body.action };
    }
    return jsonOutput(result);
  } catch (err) {
    return jsonOutput({ error: String(err) });
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ---------------------------------------------------------------------------
// Telegram auth — проверяем подпись initData, чтобы не доверять user_id из query как есть
// ---------------------------------------------------------------------------
function verifyTelegramInitData(initData) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  const pairs = [];
  params.forEach((v, k) => pairs.push(`${k}=${v}`));
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = Utilities.computeHmacSha256Signature(BOT_TOKEN, "WebAppData");
  const computedHash = Utilities.computeHmacSha256Signature(dataCheckString, secretKey)
    .map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"))
    .join("");

  if (computedHash !== hash) return null;
  return JSON.parse(params.get("user"));
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------
function sheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function readRows(name) {
  const sh = sheet(name);
  const values = sh.getDataRange().getValues();
  const headers = values.shift();
  return values.map((row) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = row[i]));
    return obj;
  });
}

function findRowIndex(sh, headerName, value) {
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const col = headers.indexOf(headerName);
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][col]) === String(value)) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

// ---------------------------------------------------------------------------
// words — читаем мастер-словарь ПО ИНДЕКСУ КОЛОНКИ (заголовки в файле не
// нормализованы — есть лишние пробелы типа " ex2", "|ex1_ru "), ничего не
// выдумываем, просто аккуратно парсим то, что есть.
// 0:ID 1:Тема№ 2:Тема 3:Русский 4:UZ 5:Уровень 6:АудиоURL
// 7:ex1_uz 8:ex1_ru 9:ex2_uz 10:ex2_ru 11:ex3_uz 12:ex3_ru 13:ex4_uz 14:ex4_ru 15:ex5_uz 16:ex5_ru
// ---------------------------------------------------------------------------
const WCOL = { ID: 0, TOPIC: 2, RU: 3, UZ: 4, LEVEL: 5 };
const WCOL_EX_UZ = [7, 9, 11, 13, 15];
const WCOL_EX_RU = [8, 10, 12, 14, 16];

function readWordRows() {
  const sh = sheet("words");
  const values = sh.getDataRange().getValues();
  values.shift(); // заголовок
  return values;
}

function rowToWord(row) {
  const examples = [];
  for (let i = 0; i < 5; i++) {
    const uz = row[WCOL_EX_UZ[i]];
    if (uz) examples.push({ uz, ru: row[WCOL_EX_RU[i]] });
  }
  return {
    id: String(row[WCOL.ID]),
    ru: row[WCOL.RU],
    uz: row[WCOL.UZ],
    topic: row[WCOL.TOPIC],
    level: row[WCOL.LEVEL],
    examples,
  };
}

function getWords(level, topic) {
  let rows = readWordRows();
  if (level) rows = rows.filter((r) => r[WCOL.LEVEL] === level);
  if (topic) rows = rows.filter((r) => r[WCOL.TOPIC] === topic);
  return rows.map(rowToWord);
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
function getOrCreateUser(initData) {
  const tgUser = verifyTelegramInitData(initData);
  if (!tgUser) return { error: "invalid init data" };

  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", tgUser.id);
  const now = new Date().toISOString();

  if (row === -1) {
    sh.appendRow([tgUser.id, tgUser.username || "", tgUser.first_name || "", "", 0, 0, now, now]);
    return { user_id: tgUser.id, username: tgUser.username, level: "", xp: 0, streak: 0 };
  }

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(row, 1, 1, headers.length).getValues()[0];
  sh.getRange(row, headers.indexOf("last_active") + 1).setValue(now);

  const obj = {};
  headers.forEach((h, i) => (obj[h] = values[i]));
  return obj;
}

// ---------------------------------------------------------------------------
// SRS — стадия слова конкретного юзера + очередь на сегодня
// ---------------------------------------------------------------------------
function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

function computeDecay(stage, lastReviewed) {
  if (stage < 5 || !lastReviewed) return 0;
  const days = daysBetween(new Date(lastReviewed), new Date());
  if (days <= DECAY_AFTER_DAYS) return 0;
  return Math.min(1, (days - DECAY_AFTER_DAYS) / (DECAY_FULL_DAYS - DECAY_AFTER_DAYS));
}

function getQueue(userId, count) {
  const words = readWordRows().map(rowToWord);
  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId));
  const byWordId = {};
  userWords.forEach((r) => (byWordId[r.word_id] = r));

  const now = new Date();
  const due = userWords.filter((r) => r.next_review && new Date(r.next_review) <= now);
  const dueIds = new Set(due.map((r) => String(r.word_id)));

  const dueWords = words.filter((w) => dueIds.has(w.id));
  const newWords = words.filter((w) => !byWordId[w.id]).slice(0, Math.max(0, count - dueWords.length));

  const queue = [...dueWords, ...newWords].slice(0, count).map((w) => {
    const uw = byWordId[w.id];
    return { wordId: w.id, ru: w.ru, uz: w.uz, topic: w.topic, stage: uw ? uw.stage : 0, examples: w.examples };
  });

  return { queue };
}

function findUserWordRow(sh, userId, wordId) {
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const uCol = headers.indexOf("user_id");
  const wCol = headers.indexOf("word_id");
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][uCol]) === String(userId) && String(values[i][wCol]) === String(wordId)) {
      return i + 1; // 1-indexed sheet row
    }
  }
  return -1;
}

function submitAnswer(userId, wordId, correct) {
  const sh = sheet("user_words");
  const row = findUserWordRow(sh, userId, wordId);
  const now = new Date().toISOString();

  let stage = 0;
  if (row !== -1) {
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    stage = sh.getRange(row, headers.indexOf("stage") + 1).getValue() || 0;
  }

  const newStage = correct ? Math.min(stage + 1, 5) : Math.max(stage - 1, 0);
  const intervalDays = INTERVAL_DAYS[newStage] || 1;
  const nextReview = new Date(Date.now() + intervalDays * 86400000).toISOString();

  if (row === -1) {
    sh.appendRow([userId, wordId, newStage, correct ? 1 : 0, correct ? 0 : 1, now, nextReview]);
  } else {
    const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    sh.getRange(row, headers.indexOf("stage") + 1).setValue(newStage);
    sh.getRange(row, headers.indexOf("last_reviewed") + 1).setValue(now);
    sh.getRange(row, headers.indexOf("next_review") + 1).setValue(nextReview);
    const cCol = headers.indexOf("correct_count") + 1;
    const wCol = headers.indexOf("wrong_count") + 1;
    if (correct) sh.getRange(row, cCol).setValue((sh.getRange(row, cCol).getValue() || 0) + 1);
    else sh.getRange(row, wCol).setValue((sh.getRange(row, wCol).getValue() || 0) + 1);
  }

  bumpXp(userId, correct ? 10 : 2);
  return { wordId, stage: newStage, nextReview };
}

function bumpXp(userId, amount) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const xpCol = headers.indexOf("xp") + 1;
  sh.getRange(row, xpCol).setValue((sh.getRange(row, xpCol).getValue() || 0) + amount);
}

// Записывает уровень, подтверждённый placement-тестом (1.3), в users.level.
function setUserLevel(userId, level) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return { error: "user not found" };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(row, headers.indexOf("level") + 1).setValue(level);
  return { ok: true, level };
}

// ---------------------------------------------------------------------------
// 1.1 — лимиты подсказок (тарифы + выходные + тестер + реклама)
// ---------------------------------------------------------------------------

// Если hints_reset_date не сегодня — обнуляем счётчик (новый день, новый лимит).
// Возвращает {row, headers, tier, used, limit} после при необходимости сброса.
function ensureHintDay(sh, row, headers) {
  const now = new Date();
  const resetCol = headers.indexOf("hints_reset_date") + 1;
  const usedCol = headers.indexOf("hints_used_today") + 1;
  const tierCol = headers.indexOf("tier") + 1;

  const storedDate = sh.getRange(row, resetCol).getValue();
  const tier = sh.getRange(row, tierCol).getValue() || "free";

  if (todayKey(now) !== (storedDate ? todayKey(new Date(storedDate)) : "")) {
    sh.getRange(row, usedCol).setValue(0);
    sh.getRange(row, resetCol).setValue(now.toISOString());
  }

  const used = sh.getRange(row, usedCol).getValue() || 0;
  const limit = hintLimitFor(tier, now);
  return { usedCol, tierCol, used, limit, tier };
}

function getHintStatus(userId) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return { error: "user not found" };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const { used, limit, tier } = ensureHintDay(sh, row, headers);
  return {
    used,
    limit: limit === Infinity ? null : limit, // null на фронте = безлимит
    remaining: limit === Infinity ? null : Math.max(0, limit - used),
    tier,
  };
}

// Списывает одну подсказку, если лимит не исчерпан. Ответы, использующие
// подсказку у тестера — не считаются в прогресс/достижения, это флаг для
// фронта (excludeFromStats), сам факт списания подсказки тестеру не мешает
// (у него безлимит, ensureHintDay просто не даст used вырасти выше limit=Infinity).
function useHint(userId) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return { error: "user not found" };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const { usedCol, used, limit, tier } = ensureHintDay(sh, row, headers);

  if (limit !== Infinity && used >= limit) {
    return { allowed: false, remaining: 0, tier };
  }
  sh.getRange(row, usedCol).setValue(used + 1);
  return {
    allowed: true,
    remaining: limit === Infinity ? null : limit - used - 1,
    excludeFromStats: tier === "tester",
  };
}

// Реклама даёт +1 подсказку сверх дневного лимита — уменьшаем used ниже нуля
// относительно limit не даём, просто увеличиваем "доступно сейчас" на 1 разовый бонус.
// Проще всего — просто списать использованную подсказку обратно (used - 1),
// но не давать уйти в отрицательные значения относительно уже потраченного.
function grantAdHint(userId) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return { error: "user not found" };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const { usedCol, used } = ensureHintDay(sh, row, headers);
  sh.getRange(row, usedCol).setValue(Math.max(0, used - 1));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Промокоды на премиум/тестер — точечные исключения без ручного копания в users.
// Строку кода добавляешь сам в лист promo_codes: code, tier, max_uses (пусто = безлимит),
// used_count (оставь 0), expires_at (пусто = бессрочно), note.
// ---------------------------------------------------------------------------
function redeemPromoCode(userId, code) {
  const codesSheet = sheet("promo_codes");
  const values = codesSheet.getDataRange().getValues();
  const headers = values[0];
  const codeCol = headers.indexOf("code");
  const tierCol = headers.indexOf("tier");
  const maxUsesCol = headers.indexOf("max_uses");
  const usedCountCol = headers.indexOf("used_count");
  const expiresCol = headers.indexOf("expires_at");

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][codeCol]).trim().toUpperCase() !== String(code).trim().toUpperCase()) continue;

    const row = i + 1;
    const maxUses = values[i][maxUsesCol];
    const usedCount = values[i][usedCountCol] || 0;
    const expiresAt = values[i][expiresCol];

    if (expiresAt && new Date(expiresAt) < new Date()) return { error: "код истёк" };
    if (maxUses && usedCount >= maxUses) return { error: "код уже исчерпан" };

    const tier = values[i][tierCol];
    const usersSheet = sheet("users");
    const userRow = findRowIndex(usersSheet, "user_id", userId);
    if (userRow === -1) return { error: "пользователь не найден" };
    const userHeaders = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0];
    usersSheet.getRange(userRow, userHeaders.indexOf("tier") + 1).setValue(tier);

    codesSheet.getRange(row, usedCountCol + 1).setValue(usedCount + 1);
    return { ok: true, tier };
  }

  return { error: "код не найден" };
}

// ---------------------------------------------------------------------------
// dictionary — слова + персональная стадия/декей конкретного юзера
// ---------------------------------------------------------------------------
function getDictionary(userId, query, level) {
  const words = getWords(level, null);
  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId));
  const byWordId = {};
  userWords.forEach((r) => (byWordId[r.word_id] = r));

  let list = words.map((w) => {
    const uw = byWordId[w.id];
    return {
      ...w,
      stage: uw ? uw.stage : 0,
      decay: uw ? computeDecay(uw.stage, uw.last_reviewed) : 0,
    };
  });

  if (query) {
    const q = query.toLowerCase();
    list = list.filter((w) => w.ru.toLowerCase().includes(q) || w.uz.toLowerCase().includes(q));
  } else {
    // без запроса не отдаём всю базу разом — только первые 50 для начального просмотра
    list = list.slice(0, 50);
  }
  return { words: list };
}

// ---------------------------------------------------------------------------
// path — % прохождения по темам (группировка как в words по колонке "Тема")
// ---------------------------------------------------------------------------
function getPath(userId) {
  const words = readWordRows().map(rowToWord);
  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId));
  const masteredIds = new Set(userWords.filter((r) => r.stage >= 5).map((r) => String(r.word_id)));

  const topics = {};
  words.forEach((w) => {
    const key = w.topic;
    if (!topics[key]) topics[key] = { name: key, level: w.level, total: 0, mastered: 0 };
    topics[key].total++;
    if (masteredIds.has(w.id)) topics[key].mastered++;
  });

  return { topics: Object.values(topics) };
}

// ---------------------------------------------------------------------------
// admin
// ---------------------------------------------------------------------------
function isAdmin(userId) {
  const admins = readRows("admins");
  return admins.some((a) => String(a.user_id) === String(userId));
}

function adminAddWord(adminUserId, word) {
  if (!isAdmin(adminUserId)) return { error: "not an admin" };
  const sh = sheet("words");
  const lastId = readWordRows().reduce((max, r) => Math.max(max, Number(r[WCOL.ID]) || 0), 0);
  // порядок строго как в реальном листе: ID, Тема№, Тема, RU, UZ, Уровень, АудиоURL, ex1..ex5 (uz/ru пары)
  const row = [
    lastId + 1,
    word.topicNumber || "",
    word.topic,
    word.ru,
    word.uz,
    word.level,
    "",
    ...(word.examples || []).flatMap((ex) => [ex.uz, ex.ru]),
  ];
  sh.appendRow(row);
  return { ok: true, id: lastId + 1 };
}
