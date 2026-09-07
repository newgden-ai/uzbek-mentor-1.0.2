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
