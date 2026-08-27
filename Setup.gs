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

  createIfMissing(ss, "user_words", [
    "user_id", "word_id", "stage", "correct_count", "wrong_count",
    "last_reviewed", "next_review",
  ]);

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

  Logger.log("Готово: служебные листы созданы (users, user_words, sessions, admins, reading_articles, app_settings).");
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
