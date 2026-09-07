/**
 * Code.gs — Web App API для мини-аппа и бота.
 * Деплой: Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone.
 * Скопируй URL из деплоя и подставь в .env фронта как VITE_API_URL.
 */

const BOT_TOKEN = PropertiesService.getScriptProperties().getProperty("BOT_TOKEN");
// 1.6/2.3 — баллы слова: 0-15, скрыто от пользователя. Визуальная стадия здания = min(5, points).
// Интервал до следующего повтора растёт с баллами; после 6 — раз в месяц, после 10 — раз в квартал.
const POINTS_INTERVAL_DAYS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 14 };
const MAX_POINTS = 15;
const ACTIVE_POOL_SIZE = 20; // сколько новых слов одновременно "в изучении" (1.6)

function intervalForPoints(points) {
  if (points <= 0) return 0;
  if (points <= 5) return POINTS_INTERVAL_DAYS[points] || 1;
  if (points <= 9) return 30; // "изучено хорошо/отлично" — повтор раз в месяц
  return 90; // "превосходно" (10-15) — повтор раз в квартал
}

// Полоса освоенности для пиалы с цифрой в Базе (2.3).
function pointsBand(points) {
  if (points <= 0) return "none";
  if (points <= 5) return "poor";
  if (points <= 7) return "good";
  if (points <= 9) return "great";
  return "excellent";
}

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
        result = getQueue(e.parameter.user_id, Number(e.parameter.count) || 10, e.parameter.mode);
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
      case "stats":
        result = getStats(e.parameter.user_id);
        break;
      case "translate":
        result = translateText(e.parameter.text, e.parameter.sl, e.parameter.tl);
        break;
      case "similarWords":
        result = findSimilarWords(e.parameter.query, Number(e.parameter.limit) || 8);
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
      case "introduceWord":
        result = introduceWord(body.user_id, body.word_id);
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
// words — читаем мастер-словарь ПО ИНДЕКСУ КОЛОНКИ. Раскладка новой таблицы
// (версия 2026-08), аудио у каждого примера своё:
// 0:ID 1:Тема№ 2:Тема 3:Русский 4:UZ 5:Уровень 6:АудиоURL(слово)
// 7:ex1 8:ex1_ru 9:ex1_audio_url 10:ex2 11:ex2_ru 12:ex2_audio_url
// 13:ex3 14:ex3_ru 15:ex3_audio_url 16:ex4 17:ex4_ru 18:ex4_audio_url
// 19:ex5 20:ex5_ru 21:ex5_audio_url
// ---------------------------------------------------------------------------
const WCOL = { ID: 0, TOPIC: 2, RU: 3, UZ: 4, LEVEL: 5, AUDIO: 6 };
const WCOL_EX_UZ = [7, 10, 13, 16, 19];
const WCOL_EX_RU = [8, 11, 14, 17, 20];
const WCOL_EX_AUDIO = [9, 12, 15, 18, 21];

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
    if (uz) examples.push({ uz, ru: row[WCOL_EX_RU[i]], audioUrl: row[WCOL_EX_AUDIO[i]] || "" });
  }
  return {
    id: String(row[WCOL.ID]),
    ru: row[WCOL.RU],
    uz: row[WCOL.UZ],
    topic: row[WCOL.TOPIC],
    level: row[WCOL.LEVEL],
    audioUrl: row[WCOL.AUDIO] || "",
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
  const now = new Date();
  const nowIso = now.toISOString();

  if (row === -1) {
    sh.appendRow([tgUser.id, tgUser.username || "", tgUser.first_name || "", "", 0, 0, nowIso, nowIso]);
    return {
      user_id: tgUser.id,
      username: tgUser.username,
      level: "",
      xp: 0,
      streak: 0,
      weekActivity: computeWeekActivity({}, now),
    };
  }

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(row, 1, 1, headers.length).getValues()[0];
  sh.getRange(row, headers.indexOf("last_active") + 1).setValue(nowIso);

  // 3 — пересчитываем streak из реального дневного лога вместо хранимого
  // значения (оно раньше нигде не обновлялось) и синхронизируем users.streak,
  // чтобы им можно было пользоваться и в других местах (достижения и т.п.).
  const dateSet = getActiveDateSet(tgUser.id);
  const streak = computeStreak(dateSet, now);
  const weekActivity = computeWeekActivity(dateSet, now);
  const streakCol = headers.indexOf("streak") + 1;
  if (streakCol > 0) sh.getRange(row, streakCol).setValue(streak);

  const obj = {};
  headers.forEach((h, i) => (obj[h] = values[i]));
  obj.streak = streak;
  obj.weekActivity = weekActivity;
  return obj;
}

// ---------------------------------------------------------------------------
// 3 — daily_activity: реальный дневной лог активности. Раньше users.streak
// нигде не обновлялся (создавался нулём и так и оставался), а на фронте
// недельная полоска в "Прогрессе" грубо прикидывалась по последнему числу
// streak. Теперь streak и полоска считаются от фактических дней с активностью.
// ---------------------------------------------------------------------------
function findDailyActivityRow(sh, userId, dateKey) {
  const values = sh.getDataRange().getValues();
  const headers = values[0];
  const uCol = headers.indexOf("user_id");
  const dCol = headers.indexOf("date");
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][uCol]) === String(userId) && String(values[i][dCol]) === dateKey) {
      return i + 1; // 1-indexed sheet row
    }
  }
  return -1;
}

// Отмечает, что userId сегодня сделал хотя бы одно упражнение (правильное или
// нет — для streak неважно, важен сам факт активности). Вызывается из submitAnswer.
function logDailyActivity(userId, date) {
  const sh = sheet("daily_activity");
  const dateKey = todayKey(date);
  const row = findDailyActivityRow(sh, userId, dateKey);
  if (row === -1) {
    sh.appendRow([userId, dateKey, 1]);
    return;
  }
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cCol = headers.indexOf("count") + 1;
  sh.getRange(row, cCol).setValue((sh.getRange(row, cCol).getValue() || 0) + 1);
}

// Множество дат ('yyyy-MM-dd', UTC) с активностью конкретного юзера — базовые
// данные для computeStreak и computeWeekActivity.
function getActiveDateSet(userId) {
  const rows = readRows("daily_activity");
  const set = {};
  rows.forEach((r) => {
    if (String(r.user_id) === String(userId)) set[r.date] = true;
  });
  return set;
}

// Текущий streak по реальному логу: идём подряд назад от сегодня, пока есть
// активность. Если сегодня ещё не позанимался — не обнуляем streak раньше
// времени, начинаем счёт со вчера (иначе streak будет мигать в 0 каждое утро
// до первой тренировки за день).
function computeStreak(dateSet, now) {
  const cursor = new Date(now);
  if (!dateSet[todayKey(cursor)]) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (dateSet[todayKey(cursor)]) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

// Недельная полоска для экрана "Прогресс": Пн..Вс текущей недели (UTC), 7
// булевых значений по факту активности в этот день. Заменяет approximateWeek
// на фронте точными данными.
function computeWeekActivity(dateSet, now) {
  const monday = new Date(now);
  const day = monday.getUTCDay(); // 0=Вс, 1=Пн, ..., 6=Сб
  const diffToMonday = day === 0 ? 6 : day - 1;
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  const week = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    week.push(Boolean(dateSet[todayKey(d)]));
  }
  return week;
}

// ---------------------------------------------------------------------------
// SRS — стадия слова конкретного юзера + очередь на сегодня
// ---------------------------------------------------------------------------
function daysBetween(a, b) {
  return Math.floor((b - a) / (1000 * 60 * 60 * 24));
}

// "Раз в месяц/раз в квартал со всех пройденных слов снимается балл" (1.6) —
// считаем эффективные баллы на лету (не переписываем таблицу при каждом чтении),
// применяются реально только при следующем настоящем ответе через submitAnswer.
function effectivePoints(rawPoints, lastReviewed) {
  if (rawPoints <= 0 || !lastReviewed) return rawPoints;
  const intervalDays = rawPoints >= 10 ? 90 : 30;
  const daysSince = daysBetween(new Date(lastReviewed), new Date());
  const periodsElapsed = Math.floor(daysSince / intervalDays);
  return Math.max(0, rawPoints - periodsElapsed);
}

// Визуальное затухание здания (0..1) — только для points >= 5 (уже "достроено"),
// тускнеет после 10 дней без повтора, полностью чб к 20-му.
function computeDecay(points, lastReviewed) {
  if (points < 5 || !lastReviewed) return 0;
  const days = daysBetween(new Date(lastReviewed), new Date());
  if (days <= 10) return 0;
  return Math.min(1, (days - 10) / 10);
}

// ---------------------------------------------------------------------------
// 1.6 — SRS на баллах + состав сессии: сначала повтор просроченных слов,
// потом изучение новых (до ACTIVE_POOL_SIZE одновременно "в работе"),
// потом практика уже показанных, но ещё не отточенных (points 1-4).
// mode: "all" (по умолчанию) | "new" (только изучение) | "review" (только повтор)
// ---------------------------------------------------------------------------
function getQueue(userId, count, mode) {
  mode = mode || "all";
  const words = readWordRows().map(rowToWord); // порядок как в листе (по темам/уровням)
  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId));
  const byWordId = {};
  userWords.forEach((r) => (byWordId[r.word_id] = r));
  const now = new Date();

  const dueReview = userWords.filter((r) => (r.points || 0) > 0 && r.next_review && new Date(r.next_review) <= now);
  const dueIds = new Set(dueReview.map((r) => String(r.word_id)));
  const dueWords = words.filter((w) => dueIds.has(w.id));

  // Активный пул: первые ACTIVE_POOL_SIZE слов (в порядке листа) с points < 5 —
  // как только слово "достроено" (points >= 5), место освобождается следующему.
  const activePool = [];
  for (const w of words) {
    const uw = byWordId[w.id];
    const points = uw ? uw.points || 0 : 0;
    if (points < 5) {
      activePool.push(w);
      if (activePool.length >= ACTIVE_POOL_SIZE) break;
    }
  }
  const learnWords = activePool.filter((w) => !byWordId[w.id] || !byWordId[w.id].introduced);
  const practiceWords = activePool.filter((w) => byWordId[w.id] && byWordId[w.id].introduced);

  function tag(w, itemMode) {
    const uw = byWordId[w.id];
    return {
      wordId: w.id, ru: w.ru, uz: w.uz, topic: w.topic, audioUrl: w.audioUrl,
      stage: uw ? uw.stage : 0,
      points: uw ? uw.points || 0 : 0,
      examples: w.examples,
      mode: itemMode,
    };
  }

  let items;
  if (mode === "review") items = dueWords.map((w) => tag(w, "exercise"));
  else if (mode === "new") items = learnWords.map((w) => tag(w, "learn"));
  else {
    items = [
      ...dueWords.map((w) => tag(w, "exercise")),
      ...learnWords.map((w) => tag(w, "learn")),
      ...practiceWords.map((w) => tag(w, "exercise")),
    ];
  }

  return { queue: items.slice(0, count) };
}

// Отмечает слово как "показанное" на карточке изучения (1.6) — баллы не меняются,
// просто снимает его с этапа "learn" и переводит в "practice" при следующей выдаче очереди.
function introduceWord(userId, wordId) {
  const sh = sheet("user_words");
  const row = getOrCreateUserWordRow(sh, userId, wordId);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.getRange(row, headers.indexOf("introduced") + 1).setValue(true);
  return { ok: true };
}

// Возвращает индекс строки user_words для (userId, wordId), создавая пустую
// строку с нулевыми значениями, если её ещё нет — используется и submitAnswer, и introduceWord.
function getOrCreateUserWordRow(sh, userId, wordId) {
  const existing = findUserWordRow(sh, userId, wordId);
  if (existing !== -1) return existing;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const blank = headers.map((h) => {
    if (h === "user_id") return userId;
    if (h === "word_id") return wordId;
    if (h === "stage" || h === "points" || h === "correct_count" || h === "wrong_count") return 0;
    if (h === "introduced") return false;
    return "";
  });
  sh.appendRow(blank);
  return sh.getLastRow();
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
  const row = getOrCreateUserWordRow(sh, userId, wordId);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const now = new Date().toISOString();

  const points = sh.getRange(row, headers.indexOf("points") + 1).getValue() || 0;
  const newPoints = correct ? Math.min(points + 1, MAX_POINTS) : Math.max(points - 1, 0);
  const newStage = Math.min(5, newPoints);
  const intervalDays = intervalForPoints(newPoints) || 1;
  const nextReview = new Date(Date.now() + intervalDays * 86400000).toISOString();

  sh.getRange(row, headers.indexOf("stage") + 1).setValue(newStage);
  sh.getRange(row, headers.indexOf("points") + 1).setValue(newPoints);
  sh.getRange(row, headers.indexOf("last_reviewed") + 1).setValue(now);
  sh.getRange(row, headers.indexOf("next_review") + 1).setValue(nextReview);
  const cCol = headers.indexOf("correct_count") + 1;
  const wCol = headers.indexOf("wrong_count") + 1;
  if (correct) sh.getRange(row, cCol).setValue((sh.getRange(row, cCol).getValue() || 0) + 1);
  else sh.getRange(row, wCol).setValue((sh.getRange(row, wCol).getValue() || 0) + 1);

  bumpXp(userId, correct ? 10 : 2);
  logDailyActivity(userId, new Date()); // 3 — отмечаем день как активный для streak
  bumpAchievementCounters(userId, correct, new Date()); // 1 — счётчики для достижений
  return { wordId, points: newPoints, stage: newStage, nextReview };
}

// ---------------------------------------------------------------------------
// 1 — достижения: счётчики, которые нельзя вывести из user_words (серия ошибок
// подряд — нужен порядок ответов; часы активности; лучший streak за всё время).
// ---------------------------------------------------------------------------
function bumpAchievementCounters(userId, correct, now) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const cellOf = (name) => {
    const idx = headers.indexOf(name);
    return idx === -1 ? null : sh.getRange(row, idx + 1);
  };

  // Серия ошибок подряд — обнуляется правильным ответом, максимум не убывает.
  const curCell = cellOf("mistakes_streak_current");
  const maxMistakeCell = cellOf("mistakes_streak_max");
  if (curCell && maxMistakeCell) {
    const cur = correct ? 0 : (Number(curCell.getValue()) || 0) + 1;
    curCell.setValue(cur);
    if (cur > (Number(maxMistakeCell.getValue()) || 0)) maxMistakeCell.setValue(cur);
  }

  // Часы суток (UTC), в которые пользователь хоть раз отвечал — для "юмор"-достижений.
  const hoursCell = cellOf("hours_active");
  if (hoursCell) {
    const hour = String(now.getUTCHours());
    const existing = String(hoursCell.getValue() || "").split(",").filter(Boolean);
    if (existing.indexOf(hour) === -1) {
      existing.push(hour);
      hoursCell.setValue(existing.join(","));
    }
  }

  // Лучший streak за всё время — специально не совпадает с текущим streak: если
  // пользователь потерял серию, уже открытые достижения не должны "сгорать".
  const maxStreakCell = cellOf("max_streak");
  if (maxStreakCell) {
    const streak = computeStreak(getActiveDateSet(userId), now);
    if (streak > (Number(maxStreakCell.getValue()) || 0)) maxStreakCell.setValue(streak);
  }
}

// Сводная статистика для экрана "Прогресс" (система достижений, 1). Всё, что
// можно вывести из user_words/daily_activity — считаем на лету, не храним
// задвоенно; в users храним только то, для чего нужен порядок событий или
// история, которую из user_words не восстановить (см. bumpAchievementCounters).
function getStats(userId) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return { error: "user not found" };
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(row, 1, 1, headers.length).getValues()[0];
  const get = (name, def) => {
    const idx = headers.indexOf(name);
    if (idx === -1) return def;
    const v = values[idx];
    return v === "" || v === null || v === undefined ? def : v;
  };

  const now = new Date();
  const dateSet = getActiveDateSet(userId);
  const streak = computeStreak(dateSet, now);
  const maxStreak = Math.max(streak, Number(get("max_streak", 0)) || 0);

  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId));
  const tasksDone = userWords.reduce((s, r) => s + (Number(r.correct_count) || 0) + (Number(r.wrong_count) || 0), 0);
  const mistakesTotal = userWords.reduce((s, r) => s + (Number(r.wrong_count) || 0), 0);
  const wordsStarted = userWords.length;
  const wordsMastered = userWords.filter((r) => Number(r.stage) >= 5).length;

  const weekdaysActive = {};
  Object.keys(dateSet).forEach((dateKey) => {
    const d = new Date(dateKey + "T00:00:00Z");
    weekdaysActive[d.getUTCDay()] = true; // 0=Вс..6=Сб
  });

  return {
    tasksDone,
    mistakesTotal,
    mistakesStreakMax: Number(get("mistakes_streak_max", 0)) || 0,
    streak,
    maxStreak,
    wordsStarted,
    wordsMastered,
    hoursActive: String(get("hours_active", "")).split(",").filter(Boolean).map(Number),
    weekdaysActive: Object.keys(weekdaysActive).map(Number),
    tier: get("tier", "free"),
    level: get("level", ""),
  };
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
    const rawPoints = uw ? uw.points || 0 : 0;
    const points = uw ? effectivePoints(rawPoints, uw.last_reviewed) : 0;
    return {
      ...w,
      stage: uw ? uw.stage : 0,
      points,
      band: pointsBand(points),
      decay: uw ? computeDecay(points, uw.last_reviewed) : 0,
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
  // порядок строго как в реальном листе: ID, Тема№, Тема, RU, UZ, Уровень, АудиоURL, (ex_uz, ex_ru, ex_audio_url) x5
  const row = [
    lastId + 1,
    word.topicNumber || "",
    word.topic,
    word.ru,
    word.uz,
    word.level,
    word.audioUrl || "",
    ...(word.examples || []).flatMap((ex) => [ex.uz, ex.ru, ex.audioUrl || ""]),
  ];
  sh.appendRow(row);
  return { ok: true, id: lastId + 1 };
}

// ---------------------------------------------------------------------------
// 2.2 — встроенный переводчик (свободный текст, не из нашей базы) + поиск
// похожих по написанию слов В НАШЕЙ базе.
// ---------------------------------------------------------------------------

// Неофициальный, но широко используемый бесплатный эндпоинт Google Translate —
// без ключа и без карты. Вызываем с бэкенда (UrlFetchApp), чтобы не упереться
// в CORS на фронте и не светить сам URL в клиентском коде.
function translateText(text, sourceLang, targetLang) {
  if (!text) return { error: "empty text" };
  const sl = sourceLang || "ru";
  const tl = targetLang || "uz";
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" + sl +
    "&tl=" + tl + "&dt=t&q=" + encodeURIComponent(text);
  try {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(res.getContentText());
    const translated = data[0].map((chunk) => chunk[0]).join("");
    return { translated, sourceLang: sl, targetLang: tl };
  } catch (err) {
    return { error: "translate failed: " + err };
  }
}

// Расстояние Левенштейна — сколько правок (замена/вставка/удаление буквы)
// отделяет одно слово от другого. Меньше = более похожи.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = [];
  for (let i = 0; i <= m; i++) dp.push(new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// Ищет ближайшие по написанию слова в НАШЕЙ базе (не в открытом интернете) —
// полезно, когда пользователь не уверен в написании или ищет однокоренные.
function findSimilarWords(query, limit) {
  if (!query) return { words: [] };
  const q = query.toLowerCase().trim();
  const words = readWordRows().map(rowToWord);
  const scored = words
    .map((w) => ({ word: w, distance: levenshtein(q, w.uz.toLowerCase()) }))
    .filter((s) => s.distance > 0)
    .sort((a, b) => a.distance - b.distance);
  return { words: scored.slice(0, limit).map((s) => ({ ...s.word, distance: s.distance })) };
}
