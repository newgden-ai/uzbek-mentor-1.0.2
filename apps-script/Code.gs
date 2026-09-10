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

// 8 — «История Узбекистана» и «Законодательство РУз» специально ведутся в
// ОТДЕЛЬНЫХ от основной таблицы файлах (свой Google-документ на каждый курс,
// не лист в общей таблице со словами) — так их может наполнять/редактировать
// кто-то другой, не трогая словарь вообще. ID каждого файла — в своих
// свойствах скрипта: HISTORY_SPREADSHEET_ID и LAW_SPREADSHEET_ID.
//
// 5 — раньше SpreadsheetApp.openById(id) вызывался без try/catch: если в
// свойстве оказывался неверный ID (например, скопирован вместе с пробелом
// или это ссылка целиком, а не голый ID) или скрипт не имеет доступа к файлу,
// вызов бросал исключение. Оно долетало до общего try/catch в routeRequest()
// и превращалось в {error: ...} — но фронт (SpecialTrackScreen.jsx) видел
// только "нет subLevels" и молча показывал "материалы скоро появятся",
// маскируя настоящую причину (неверный ID/нет доступа) под "просто пока нет
// контента". Теперь ошибка открытия таблицы возвращается явным текстом.
function getSpecialTrackSpreadsheet(track) {
  const propName = track === "history" ? "HISTORY_SPREADSHEET_ID" : track === "law" ? "LAW_SPREADSHEET_ID" : null;
  if (!propName) return { ss: null, error: "неизвестный трек: " + track };
  const id = (PropertiesService.getScriptProperties().getProperty(propName) || "").trim();
  if (!id) return { ss: null, error: null }; // не настроено — специально не ошибка, фронт покажет "материалы скоро появятся"
  try {
    return { ss: SpreadsheetApp.openById(id), error: null };
  } catch (err) {
    return {
      ss: null,
      error: `Не удалось открыть таблицу "${propName}" (ID: "${id}"): ${err}. Проверь, что в свойстве скрипта лежит именно ID файла (часть ссылки между /d/ и /edit), и что таблица расшарена как минимум "Читатель" для аккаунта, под которым выполняется скрипт.`,
    };
  }
}

// ---------------------------------------------------------------------------
// 5 — ВАЖНО: doGet и doPost больше НЕ имеют раздельных списков действий.
// Раньше "пишущие" действия (submitAnswer, introduceWord, setUserLevel,
// useHint, grantAdHint, redeemPromoCode, completeCheckpoint) обрабатывались
// только в doPost. Но веб-приложение Apps Script по адресу .../exec всегда
// отвечает HTTP-редиректом (302) на настоящий адрес с содержимым
// (script.googleusercontent.com). Браузерный fetch следует за редиректом
// автоматически — а по спецификации fetch, если ИСХОДНЫЙ запрос был POST,
// то после 301/302/303-редиректа повторный запрос ПРЕВРАЩАЕТСЯ В GET и ТЕЛО
// ЗАПРОСА ОТБРАСЫВАЕТСЯ. Из-за этого POST с фронта долетал до Apps Script
// уже как пустой GET, попадал в doGet, e.parameter.action был undefined —
// отсюда и {"error":"unknown action: undefined"} на каждое действие,
// отправленное через apiPost().
//
// Исправление: ВСЕ действия (и чтение, и запись) теперь идут через один и
// тот же роутер routeRequest(), а фронт (см. src/api.js) отправляет их все
// через GET с параметрами в query-строке — GET-редирект метод сохраняет.
// doPost оставлен работать через тот же роутер (на случай прямых серверных
// вызовов API вне браузера), но фронт им больше не пользуется.
// ---------------------------------------------------------------------------
function doGet(e) {
  return jsonOutput(routeRequest(e.parameter.action, e.parameter));
}

function doPost(e) {
  let body = {};
  try {
    if (e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
  } catch (err) {
    body = {};
  }
  // e.parameter тоже может содержать action/данные, если запрос отправили как
  // POST на URL с query-параметрами — на всякий случай объединяем оба источника,
  // тело (body) в приоритете.
  const params = Object.assign({}, e.parameter, body);
  const action = body.action || (e.parameter && e.parameter.action);
  return jsonOutput(routeRequest(action, params));
}

function toBool(v) {
  return v === true || v === "true" || v === "1" || v === 1;
}

function routeRequest(action, p) {
  p = p || {};
  try {
    switch (action) {
      case "words":
        return getWords(p.level, p.topic);
      case "user":
        return getOrCreateUser(p.init_data);
      case "queue":
        return getQueue(
          p.user_id, Number(p.count) || 10, p.mode,
          p.topic, p.level,
          p.offset != null && p.offset !== "" ? Number(p.offset) : null,
          p.limit != null && p.limit !== "" ? Number(p.limit) : null
        );
      case "dictionary":
        return getDictionary(p.user_id, p.query, p.level);
      case "learnedWords":
        return getLearnedWords(p.user_id);
      case "path":
        return getPath(p.user_id);
      case "topicProgress":
        return getTopicProgress(p.user_id, p.level, p.topic);
      case "hintStatus":
        return getHintStatus(p.user_id);
      case "stats":
        return getStats(p.user_id);
      case "translate":
        return translateText(p.text, p.sl, p.tl);
      case "similarWords":
        return findSimilarWords(p.query, Number(p.limit) || 8);
      case "checkpointStatus":
        return getCheckpointStatus(p.user_id);
      case "checkpointQueue":
        return getCheckpointQueue(p.user_id, Number(p.count) || 30);
      case "specialTrack":
        return getSpecialTrack(p.track);
      case "specialTrackQueue":
        return getSpecialTrackQueue(p.track, p.subLevel);
      case "submitAnswer":
        return submitAnswer(p.user_id, p.word_id, toBool(p.correct));
      case "introduceWord":
        return introduceWord(p.user_id, p.word_id);
      case "adminAddWord":
        return adminAddWord(p.admin_user_id, typeof p.word === "string" ? JSON.parse(p.word) : p.word);
      case "setUserLevel":
        return setUserLevel(p.user_id, p.level);
      case "useHint":
        return useHint(p.user_id);
      case "grantAdHint":
        return grantAdHint(p.user_id);
      case "redeemPromoCode":
        return redeemPromoCode(p.user_id, p.code);
      case "completeCheckpoint":
        return completeCheckpoint(p.user_id);
      default:
        return { error: "unknown action: " + action };
    }
  } catch (err) {
    return { error: String(err) };
  }
}

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// ---------------------------------------------------------------------------
// Telegram auth — проверяем подпись initData, чтобы не доверять user_id из query как есть
//
// 4 — НАЙДЕНА ВЕРОЯТНАЯ КОРНЕВАЯ ПРИЧИНА, почему авторизация/синхронизация не
// работала вообще: тут стоял `new URLSearchParams(initData)`, а URLSearchParams
// — это Web API браузера/Node, его НЕТ в рантайме Google Apps Script (V8 без
// браузерных API). Вызов кидал ReferenceError на каждый запрос → verify всегда
// падал → getOrCreateUser всегда возвращал ошибку → у пользователя никогда не
// было настоящего личного user_id → ничего не синхронизировалось. Заменил на
// ручной парсер без внешних API.
// ---------------------------------------------------------------------------
function parseInitData(initData) {
  const result = {};
  initData.split("&").forEach((pair) => {
    if (!pair) return;
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = decodeURIComponent(pair.slice(0, idx));
    const value = decodeURIComponent(pair.slice(idx + 1).replace(/\+/g, " "));
    result[key] = value;
  });
  return result;
}

// 6 — verifyTelegramInitData теперь возвращает не просто null при любой
// проблеме, а объект { user, error } — раньше любая причина сбоя (не задан
// BOT_TOKEN, initData не пришёл с фронта, initData просрочен, подпись не
// совпала) схлопывалась в один и тот же "invalid init data", и разобраться,
// что именно сломано в конкретном деплое, было невозможно без залезания в код.
const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60; // 24 часа — типовая рекомендация Telegram против replay-атак

function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN) {
    return { user: null, error: "BOT_TOKEN не задан в свойствах скрипта (Настройки проекта → Свойства скрипта)" };
  }
  if (!initData) {
    return { user: null, error: "initData не передан с фронта (открой мини-апп через Telegram, а не напрямую в браузере)" };
  }

  const params = parseInitData(initData);
  const hash = params.hash;
  if (!hash) return { user: null, error: "в initData нет hash — похоже на обрезанные/повреждённые данные" };

  const pairs = Object.keys(params)
    .filter((k) => k !== "hash")
    .map((k) => `${k}=${params[k]}`)
    .sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = Utilities.computeHmacSha256Signature(BOT_TOKEN, "WebAppData");
  // У Utilities.computeHmacSha256Signature в Apps Script нет перегрузки
  // (String, Byte[]) — только (String, String) или (Byte[], Byte[]). secretKey
  // тут уже байты (результат первого вызова), поэтому dataCheckString тоже
  // нужно явно превратить в байты, иначе рантайм кидает "не соответствуют
  // сигнатуре метода".
  const dataCheckBytes = Utilities.newBlob(dataCheckString).getBytes();
  const computedHash = Utilities.computeHmacSha256Signature(dataCheckBytes, secretKey)
    .map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"))
    .join("");

  if (computedHash !== hash) {
    return { user: null, error: "подпись initData не совпала — проверь, что BOT_TOKEN в свойствах скрипта совпадает с токеном именно того бота, под которым открыт мини-апп" };
  }

  const authDate = Number(params.auth_date) || 0;
  const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
  if (authDate && ageSeconds > INIT_DATA_MAX_AGE_SECONDS) {
    return { user: null, error: "initData устарел (сессия слишком старая) — перезайди в мини-апп" };
  }

  try {
    return { user: JSON.parse(params.user), error: null };
  } catch (err) {
    return { user: null, error: "не удалось разобрать поле user из initData: " + err };
  }
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------
function sheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

function readRows(name) {
  return readRowsFromSheetObject(sheet(name));
}

// Тот же разбор строк, но для листа, который уже открыт (в том числе из
// ДРУГОГО файла — используется для истории/законодательства, см. 8).
function readRowsFromSheetObject(sh) {
  if (!sh) return [];
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

// 1.4 — "База" зависала: readWordRows() читал ВЕСЬ лист words (8781 строк x
// 22 колонки) через getDataRange().getValues() на КАЖДЫЙ запрос — words,
// dictionary (на каждую букву поиска), path, queue и т.д. Это самый тяжёлый
// вызов в скрипте. Кешируем результат через CacheService: сам лист words
// меняется редко (только adminAddWord), а не на каждый чих пользователя.
// CacheService хранит значения максимум 100КБ на ключ, поэтому режем на
// куски. TTL 6 часов — на случай, если кто-то поправил таблицу руками, а
// invalidateWordsCache() (вызывается из adminAddWord) сбрасывает сразу.
const WORDS_CACHE_PREFIX = "words_v1_chunk_";
const WORDS_CACHE_META = "words_v1_meta";
const WORDS_CACHE_TTL = 21600; // 6 часов
const WORDS_CACHE_CHUNK_SIZE = 200; // строк на чанк — с запасом под лимит 100КБ/ключ

function readWordRows() {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(WORDS_CACHE_META);
  if (meta) {
    try {
      const chunkCount = Number(meta);
      const keys = [];
      for (let i = 0; i < chunkCount; i++) keys.push(WORDS_CACHE_PREFIX + i);
      const chunks = cache.getAll(keys);
      if (Object.keys(chunks).length === chunkCount) {
        let rows = [];
        for (let i = 0; i < chunkCount; i++) {
          rows = rows.concat(JSON.parse(chunks[WORDS_CACHE_PREFIX + i]));
        }
        return rows;
      }
    } catch (err) {
      // повреждённый/неполный кеш — просто перечитываем из таблицы ниже
    }
  }

  const sh = sheet("words");
  const values = sh.getDataRange().getValues();
  values.shift(); // заголовок

  try {
    const chunkCount = Math.ceil(values.length / WORDS_CACHE_CHUNK_SIZE) || 0;
    const payload = {};
    for (let i = 0; i < chunkCount; i++) {
      const chunk = values.slice(i * WORDS_CACHE_CHUNK_SIZE, (i + 1) * WORDS_CACHE_CHUNK_SIZE);
      payload[WORDS_CACHE_PREFIX + i] = JSON.stringify(chunk);
    }
    cache.putAll(payload, WORDS_CACHE_TTL);
    cache.put(WORDS_CACHE_META, String(chunkCount), WORDS_CACHE_TTL);
  } catch (err) {
    // если таблица слишком большая даже для кеша — не страшно, просто не
    // закешируется и будем читать напрямую каждый раз, как раньше.
  }

  return values;
}

// Вызывается после adminAddWord — новое слово иначе не появится, пока не
// истекут 6 часов TTL.
function invalidateWordsCache() {
  const cache = CacheService.getScriptCache();
  const meta = cache.get(WORDS_CACHE_META);
  if (!meta) return;
  const chunkCount = Number(meta);
  const keys = [WORDS_CACHE_META];
  for (let i = 0; i < chunkCount; i++) keys.push(WORDS_CACHE_PREFIX + i);
  cache.removeAll(keys);
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

// 7 — реальный прогресс по подтемам (Часть 1/2/3…) внутри темы, вместо
// демо-заглушки, которая делила подтемы пополам просто по статусу темы.
// Отдаём points каждого слова темы в ТОМ ЖЕ порядке, что и getWords/getQueue,
// чтобы фронт мог нарезать их на те же куски по CHUNK_SIZE и посчитать,
// какая часть реально пройдена (все слова в ней достроены, points >= 5).
function getTopicProgress(userId, level, topic) {
  let words = readWordRows().map(rowToWord);
  if (level) words = words.filter((w) => w.level === level);
  if (topic) words = words.filter((w) => w.topic === topic);
  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId));
  const byId = {};
  userWords.forEach((r) => (byId[r.word_id] = r));
  const points = words.map((w) => (byId[w.id] ? byId[w.id].points || 0 : 0));
  return { points };
}

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
function getOrCreateUser(initData) {
  const verified = verifyTelegramInitData(initData);
  if (!verified.user) return { error: verified.error || "invalid init data" };
  const tgUser = verified.user;

  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", tgUser.id);
  const now = new Date();
  const nowIso = now.toISOString();

  if (row === -1) {
    sh.appendRow([tgUser.id, tgUser.username || "", tgUser.first_name || "", "", 0, 0, nowIso, nowIso]);
    return {
      user_id: tgUser.id,
      username: tgUser.username || "",
      first_name: tgUser.first_name || "",
      level: "",
      xp: 0,
      streak: 0,
      weekActivity: computeWeekActivity({}, now),
    };
  }

  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const values = sh.getRange(row, 1, 1, headers.length).getValues()[0];
  sh.getRange(row, headers.indexOf("last_active") + 1).setValue(nowIso);

  // 6 — раньше username/first_name писались в таблицу ТОЛЬКО при первом
  // создании строки и больше никогда не обновлялись. Если человек сменил
  // логин/имя в Telegram (или в момент первого захода username вообще не был
  // задан), в приложении навсегда оставались устаревшие/пустые данные, и в
  // профиле мог отображаться не тот логин. Теперь синхронизируем их с
  // актуальными данными из initData на каждый заход.
  const usernameCol = headers.indexOf("username") + 1;
  const firstNameCol = headers.indexOf("first_name") + 1;
  if (usernameCol > 0) sh.getRange(row, usernameCol).setValue(tgUser.username || "");
  if (firstNameCol > 0) sh.getRange(row, firstNameCol).setValue(tgUser.first_name || "");

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
  obj.username = tgUser.username || "";
  obj.first_name = tgUser.first_name || "";
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
//
// 3.1/7 — topic/level/offset/limit: раньше открытие темы из "Пути" шло через
// getWords() и ВСЕГДА принудительно ставило mode:"exercise" — то есть даже
// совсем новые, ни разу не показанные слова сразу превращались в задания без
// карточки "узнай слово". Плюс "части" темы (Часть 1/2/3) были чисто
// декоративными — под капотом всегда грузилась вся тема целиком. Теперь тема
// (и конкретный её кусок через offset/limit) идёт через ту же самую SRS-
// логику (due → learn → practice), что и обычная сессия, просто в границах
// этой темы/части — так "часть" реально ограничивает набор слов, а новые
// слова действительно сначала показываются, а не сразу спрашиваются.
// ---------------------------------------------------------------------------
function getQueue(userId, count, mode, topic, level, offset, limit) {
  mode = mode || "all";
  let words = readWordRows().map(rowToWord); // порядок как в листе (по темам/уровням)
  if (topic) words = words.filter((w) => w.topic === topic);
  if (level) words = words.filter((w) => w.level === level);
  const isScoped = Boolean(topic); // тема/часть — работаем со всем этим набором, а не только с ACTIVE_POOL_SIZE
  if (offset != null && limit != null) words = words.slice(offset, offset + limit);

  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId));
  const byWordId = {};
  userWords.forEach((r) => (byWordId[r.word_id] = r));
  const now = new Date();

  const dueReview = userWords.filter((r) => (r.points || 0) > 0 && r.next_review && new Date(r.next_review) <= now);
  const dueIds = new Set(dueReview.map((r) => String(r.word_id)));
  const dueWords = words.filter((w) => dueIds.has(w.id));

  // Активный пул: первые ACTIVE_POOL_SIZE слов (в порядке листа) с points < 5 —
  // как только слово "достроено" (points >= 5), место освобождается следующему.
  // Если сессия ограничена конкретной темой/частью — пул это ВСЕ слова темы,
  // а не только первые ACTIVE_POOL_SIZE из всей базы.
  const activePool = [];
  for (const w of words) {
    const uw = byWordId[w.id];
    const points = uw ? uw.points || 0 : 0;
    if (points < 5) {
      activePool.push(w);
      if (!isScoped && activePool.length >= ACTIVE_POOL_SIZE) break;
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

  return { queue: isScoped ? items : items.slice(0, count) };
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

// 3.2/9 — самозащита от рассинхронизации таблицы: если после обновления кода
// кто-то забыл заново запустить setupSheets(), нужных колонок в users может
// не быть, и headers.indexOf(...) вернёт -1 → getRange(row, 0) кидает ошибку
// → фича молча "не реагирует" (это была вероятная причина, почему подсказка
// не отвечала). ensureColumns дописывает недостающие колонки на лету, вместо
// того чтобы падать.
function ensureColumns(sh, names) {
  const lastCol = sh.getLastColumn();
  const headers = lastCol > 0 ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  const missing = names.filter((n) => headers.indexOf(n) === -1);
  if (missing.length > 0) {
    sh.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
}

// Если hints_reset_date не сегодня — обнуляем счётчик (новый день, новый лимит).
// Возвращает {row, headers, tier, used, limit} после при необходимости сброса.
function ensureHintDay(sh, row, headers) {
  headers = ensureColumns(sh, ["hints_reset_date", "hints_used_today", "tier"]);
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
    const exact = list.filter((w) => w.ru.toLowerCase().includes(q) || w.uz.toLowerCase().includes(q));
    if (exact.length > 0) {
      list = exact;
    } else {
      // 1.1 — точных совпадений нет: показываем похожие по написанию узбекские
      // слова (опечатка/неточный ввод), а не пустой список "ничего не найдено".
      const scored = list
        .map((w) => ({ w, d: levenshtein(q, w.uz.toLowerCase()) }))
        .filter((s) => s.d <= 3)
        .sort((a, b) => a.d - b.d);
      list = scored.slice(0, 20).map((s) => s.w);
    }
  } else {
    // без запроса не отдаём всю базу разом — только первые 50 для начального просмотра
    list = list.slice(0, 50);
  }
  return { words: list };
}

// 6 — игра "Найди слова" использовала getDictionary({}) без query, а та без
// query всегда отдаёт одни и те же ПЕРВЫЕ 50 слов листа (см. комментарий выше:
// это сделано специально, чтобы не гонять всю базу на пустой поиск). Из-за
// этого игра "видела" только слова из этого фиксированного окна и часто не
// находила реально изученные пользователем слова, если он ушёл в изучении
// дальше первых 50 строк листа. Отдельный эндпоинт без 50-кап, фильтрует по
// реальным баллам пользователя (points > 0) по ВСЕЙ базе.
function getLearnedWords(userId) {
  const words = readWordRows().map(rowToWord);
  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId) && (r.points || 0) > 0);
  const byWordId = {};
  userWords.forEach((r) => (byWordId[r.word_id] = r));
  const list = words
    .filter((w) => byWordId[w.id])
    .map((w) => ({ ...w, points: byWordId[w.id].points || 0, stage: byWordId[w.id].stage || 0 }));
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
// 9 — контрольная проверка каждые 500 изученных слов. "Изучено" здесь = слово
// показано (introduced=true в user_words), не обязательно доучено до конца —
// проверка как раз и должна закреплять пройденное. users.checkpoint_at
// хранит порог (кратный 500), на котором пользователь последний раз прошёл
// проверку; due = true, когда introduced-слов накопилось на следующий порог.
// ---------------------------------------------------------------------------
const CHECKPOINT_STEP = 500;
const CHECKPOINT_QUESTIONS = 30;

function countIntroducedWords(userId) {
  const userWords = readRows("user_words").filter((r) => String(r.user_id) === String(userId));
  return userWords.filter((r) => r.introduced === true || r.introduced === "TRUE" || Number(r.points) > 0).length;
}

function getCheckpointStatus(userId) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return { error: "user not found" };
  const headers = ensureColumns(sh, ["checkpoint_at"]);
  const cpCol = headers.indexOf("checkpoint_at");
  const checkpointAt = cpCol === -1 ? 0 : Number(sh.getRange(row, cpCol + 1).getValue()) || 0;

  const introduced = countIntroducedWords(userId);
  const nextAt = checkpointAt + CHECKPOINT_STEP;
  return {
    due: introduced >= nextAt,
    wordsIntroduced: introduced,
    checkpointAt,
    nextAt,
  };
}

// 30 случайных заданий из ВСЕГО пройденного языкового материала (введённые
// слова пользователя), не только из последних 500 — так и просили: после
// каждых следующих 500 проверка снова идёт по всему накопленному материалу.
function getCheckpointQueue(userId, count) {
  count = count || CHECKPOINT_QUESTIONS;
  const words = readWordRows().map(rowToWord);
  const byId = {};
  words.forEach((w) => (byId[w.id] = w));

  const userWords = readRows("user_words").filter(
    (r) => String(r.user_id) === String(userId) && (r.introduced === true || r.introduced === "TRUE" || Number(r.points) > 0)
  );
  const pool = userWords.map((r) => byId[String(r.word_id)]).filter(Boolean);
  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, count);
  const items = shuffled.map((w) => ({
    wordId: w.id, ru: w.ru, uz: w.uz, topic: w.topic, audioUrl: w.audioUrl,
    examples: w.examples, mode: "exercise",
  }));
  return { queue: items };
}

function completeCheckpoint(userId) {
  const sh = sheet("users");
  const row = findRowIndex(sh, "user_id", userId);
  if (row === -1) return { error: "user not found" };
  const headers = ensureColumns(sh, ["checkpoint_at"]);
  const cpCol = headers.indexOf("checkpoint_at");
  if (cpCol === -1) return { error: "checkpoint_at column missing" };

  const introduced = countIntroducedWords(userId);
  // Фиксируем порог, до которого реально дошли (округление вниз до шага 500),
  // а не просто +500 — если пользователь долго не открывал проверку и успел
  // выучить 1200 слов, следующая проверка не откроется через 500 сразу же.
  const newCheckpoint = Math.floor(introduced / CHECKPOINT_STEP) * CHECKPOINT_STEP;
  sh.getRange(row, cpCol + 1).setValue(newCheckpoint);
  return { ok: true, checkpointAt: newCheckpoint };
}

// ---------------------------------------------------------------------------
// 8 — «История Узбекистана» и «Законодательство РУз»: отдельные спецкурсы,
// каждый со своими подуровнями. По просьбе — контент ведётся в ДВУХ ОТДЕЛЬНЫХ
// Google-таблицах (не в листах основной таблицы со словами), см.
// getSpecialTrackSpreadsheet выше. В каждом файле нужен лист "content" с
// колонками: id, subLevel, subLevelLabel, question, correct, wrong1, wrong2, wrong3.
// Если файл не подключён (нет ID в свойствах скрипта) или лист "content" пуст —
// отдаём пустой список подуровней, фронт покажет "материалы скоро появятся"
// вместо выдуманных фактов об истории/законах (это осознанно). Но если ID
// задан и файл при этом не открывается (см. getSpecialTrackSpreadsheet) или
// лист называется не "content" — это уже настоящая ошибка конфигурации, и
// она возвращается явно, а не маскируется под "пусто".
// ---------------------------------------------------------------------------
const SPECIAL_TRACK_SHEET_NAME = "content";

function getSpecialTrackRows(track) {
  const { ss, error } = getSpecialTrackSpreadsheet(track);
  if (error) return { rows: null, error };
  if (!ss) return { rows: [], error: null }; // действительно не настроено
  const sh = ss.getSheetByName(SPECIAL_TRACK_SHEET_NAME);
  if (!sh) {
    return { rows: null, error: `В таблице для "${track}" нет листа "${SPECIAL_TRACK_SHEET_NAME}" (проверь регистр и пробелы в названии листа).` };
  }
  return { rows: readRowsFromSheetObject(sh), error: null };
}

function getSpecialTrack(track) {
  const { rows, error } = getSpecialTrackRows(track);
  if (error) return { error };
  const bySub = {};
  rows.forEach((r) => {
    const key = String(r.subLevel || "1");
    if (!bySub[key]) bySub[key] = { subLevel: key, label: r.subLevelLabel || `Часть ${key}`, count: 0 };
    bySub[key].count++;
  });
  return { subLevels: Object.values(bySub) };
}

function getSpecialTrackQueue(track, subLevel) {
  const { rows, error } = getSpecialTrackRows(track);
  if (error) return { error };
  const filtered = rows.filter((r) => String(r.subLevel || "1") === String(subLevel));
  const items = filtered.map((r) => ({
    id: r.id,
    type: "choice",
    prompt: track === "history" ? "История Узбекистана" : "Законодательство РУз",
    source: r.question,
    options: [
      { text: r.correct, correct: true },
      { text: r.wrong1, correct: false },
      { text: r.wrong2, correct: false },
      { text: r.wrong3, correct: false },
    ].filter((o) => o.text),
  }));
  return { queue: sample(items) };
}
function sample(arr) { return [...arr].sort(() => Math.random() - 0.5); }

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
  invalidateWordsCache();
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
