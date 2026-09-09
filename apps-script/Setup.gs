/**
 * Setup.gs — запусти ОДИН РАЗ функцию setupSheets() из редактора Apps Script
 * (выбрать функцию в выпадающем списке сверху → Run). Она создаст служебные
 * листы, если их ещё нет. Существующий лист `words` не трогает.
 */
function setupSheets() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) {
    Logger.log(
      "ОШИБКА: не задан SPREADSHEET_ID. Настройки проекта → Свойства скрипта → добавь SPREADSHEET_ID (ID из URL таблицы)."
    );
    return;
  }
  const ss = SpreadsheetApp.openById(id);

  createIfMissing(ss, "users", [
    "user_id", "username", "first_name", "level", "xp", "streak",
    "last_active", "created_at",
  ]);
  addColumnsIfMissing(ss, "users", ["tier", "hints_used_today", "hints_reset_date"]);
  // 1 — счётчики для системы достижений: max_streak — лучший streak за всё
  // время (не должен "сгорать", если пользователь потерял текущую серию),
  // mistakes_streak_* — серия ошибок подряд (для "юмор"-достижений),
  // hours_active — часы суток (0-23, через запятую), когда пользователь
  // хоть раз отвечал на задание — для достижений вида "занимался ночью".
  addColumnsIfMissing(ss, "users", ["max_streak", "mistakes_streak_current", "mistakes_streak_max", "hours_active"]);
  // 9 — порог (кратный 500) изученных слов, на котором пользователь последний
  // раз прошёл контрольную проверку.
  addColumnsIfMissing(ss, "users", ["checkpoint_at"]);

  createIfMissing(ss, "user_words", [
    "user_id", "word_id", "stage", "correct_count", "wrong_count",
    "last_reviewed", "next_review",
  ]);
  addColumnsIfMissing(ss, "user_words", ["points", "introduced"]);

  createIfMissing(ss, "sessions", [
    "session_id", "user_id", "type", "date", "score", "total",
  ]);

  createIfMissing(ss, "admins", ["user_id", "name", "added_date"]);

  createIfMissing(ss, "promo_codes", [
    "code", "tier", "max_uses", "used_count", "expires_at", "note",
  ]);

  createIfMissing(ss, "reading_articles", [
    "id", "title", "level", "text", "added_by", "added_date",
  ]);

  createIfMissing(ss, "app_settings", ["key", "value"]);

  // 3 — реальный дневной лог активности: 1 строка = 1 юзер + 1 календарный день
  // (UTC, формат yyyy-MM-dd), на его основе точно считаем streak и недельную
  // полоску в "Прогрессе" вместо грубой прикидки по суммарному числу streak.
  createIfMissing(ss, "daily_activity", ["user_id", "date", "count"]);

  Logger.log("Готово: служебные листы созданы (users, user_words, sessions, admins, reading_articles, app_settings, daily_activity).");
  Logger.log("История/Законодательство настраиваются отдельно — см. setupHistorySheet()/setupLawSheet() ниже.");
}

// ---------------------------------------------------------------------------
// 8 — «История Узбекистана» и «Законодательство РУз»: по просьбе ведутся
// КАЖДЫЙ В СВОЁМ ОТДЕЛЬНОМ Google-файле (не в этой таблице со словами) —
// так их может наполнять кто-то другой, не трогая словарь вообще.
//
// Как подключить (для каждого курса отдельно):
//   1. Создай новую пустую Google Таблицу (File → New spreadsheet) — свою
//      для истории, свою для законодательства.
//   2. Скопируй её ID из адресной строки:
//      docs.google.com/spreadsheets/d/ВОТ_ЭТОТ_КУСОК/edit
//   3. В Apps Script → Настройки проекта → Свойства скрипта добавь:
//        HISTORY_SPREADSHEET_ID = <id файла с историей>
//        LAW_SPREADSHEET_ID     = <id файла с законодательством>
//   4. Запусти setupHistorySheet() и/или setupLawSheet() один раз — создаст
//      в нужном файле лист "content" с правильными колонками.
//   5. Заполняй строки прямо в этом отдельном файле — правки применяются
//      сразу, без нового деплоя (эти листы не кешируются).
//
// Пока свойство не задано или лист "content" пуст — соответствующий раздел в
// приложении честно показывает "материалы скоро появятся", а не что-то
// придуманное: фактический контент по истории/законам должен наполнить
// человек, это не генерируется автоматически.
// ---------------------------------------------------------------------------
const SPECIAL_CONTENT_HEADERS = ["id", "subLevel", "subLevelLabel", "question", "correct", "wrong1", "wrong2", "wrong3"];

function setupHistorySheet() {
  setupSpecialTrackSheet("HISTORY_SPREADSHEET_ID", "истории Узбекистана");
}

function setupLawSheet() {
  setupSpecialTrackSheet("LAW_SPREADSHEET_ID", "законодательства РУз");
}

function setupSpecialTrackSheet(propName, label) {
  const id = PropertiesService.getScriptProperties().getProperty(propName);
  if (!id) {
    Logger.log(`ОШИБКА: не задан ${propName}. Настройки проекта → Свойства скрипта → добавь ${propName} (ID отдельного файла для ${label}).`);
    return;
  }
  // "You do not have permission to access the requested document" почти всегда
  // значит одно из двух: (1) в ID попал кусок URL/пробелы/кавычки вместо
  // чистого ID, или (2) файл создан под ДРУГИМ Google-аккаунтом, чем тот, под
  // которым выполняется сам скрипт — тогда нужно либо пересоздать таблицу тем
  // же аккаунтом, либо явно расшарить её (Share → Editor) на аккаунт, который
  // выполняет Apps Script (см. иконку профиля в правом верхнем углу редактора).
  let ss;
  try {
    ss = SpreadsheetApp.openById(id.trim());
  } catch (err) {
    Logger.log(
      `ОШИБКА при открытии файла для ${label} (ID: "${id}"): ${err.message}\n` +
      `Проверь: 1) в свойстве ${propName} лежит ТОЛЬКО ID (кусок из URL между /d/ и /edit), без остального адреса; ` +
      `2) файл создан тем же Google-аккаунтом, под которым выполняется этот скрипт (или явно расшарен на него через Share → Editor). ` +
      `Кому принадлежит запуск скрипта — видно по иконке профиля в правом верхнем углу редактора Apps Script.`
    );
    return;
  }
  createIfMissing(ss, "content", SPECIAL_CONTENT_HEADERS);
  Logger.log(`Готово: лист "content" для ${label} создан/проверен в отдельном файле (${ss.getName()}).`);
}

function createIfMissing(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

// Добавляет недостающие колонки в конец уже существующего листа, не трогая
// имеющиеся данные — нужно для миграции users после того, как лист уже создан.
function addColumnsIfMissing(ss, name, newHeaders) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) return;
  const lastCol = sheet.getLastColumn();
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const toAdd = newHeaders.filter((h) => !existing.includes(h));
  if (toAdd.length === 0) return;
  sheet.getRange(1, lastCol + 1, 1, toAdd.length).setValues([toAdd]);
  Logger.log(`Добавлены колонки в "${name}": ${toAdd.join(", ")}`);
}
