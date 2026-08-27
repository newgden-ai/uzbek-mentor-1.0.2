# Uzbek Mentor — мини-апп

Единое SPA-приложение: все 5 экранов (Дом, Путь, Язык, Прогресс, База) с общей
навигацией и общей дизайн-системой (`src/theme.js`).

**Всё собирается и публикуется в облаке (GitHub Actions → GitHub Pages).
Никакой локальный компьютер для сборки/хостинга не нужен ни на одном этапе —
только браузер.**

## Как это устроено

- Код лежит в репозитории на GitHub (редактируется прямо в браузере на github.com)
- При каждом изменении GitHub Actions (`.github/workflows/deploy.yml`) сам собирает
  приложение и публикует на GitHub Pages — бесплатный статический хостинг
- Пользователи открывают уже готовый сайт, никто ничего не собирает у себя

## Публикация — пошагово (всё через браузер)

1. На github.com: **New repository** → название, например `uzbek-mentor-app` → Create
2. В новом репозитории: **Add file → Upload files** → перетащи все файлы и папки
   из этого архива (включая скрытую папку `.github`) → Commit changes
3. Settings → Secrets and variables → Actions → **New repository secret**:
   имя `VITE_API_URL`, значение — URL твоего задеплоенного Apps Script (заканчивается на `/exec`)
4. Settings → Pages → Source: **GitHub Actions**
5. Settings → вкладка **Actions** repo — убедиться, что workflow запустился (зелёная галка).
   Через пару минут сайт будет доступен по адресу вида
   `https://ТВОЙ_АККАУНТ.github.io/uzbek-mentor-app/`
6. Этот адрес — вставить в BotFather как `web_app` кнопку меню бота

Дальше при любом изменении файлов прямо на github.com (карандаш → правка → Commit)
сайт пересобирается и обновляется сам, автоматически.

## Структура

```
src/
  theme.js                  — цвета/градиенты, единая точка правды для дизайна
  api.js                    — слой доступа к Apps Script API (с фоллбеком на моки)
  data/words.js              — заглушка данных, пока не подключён API
  components/
    BottomNav.jsx             — нижняя навигация
    LandmarkStage.jsx         — иконка-здание (стадии заучивания слова) + попап
  screens/
    HomeScreen.jsx             — Дом
    PathScreen.jsx             — Путь
    TrainerScreen.jsx          — Язык (движок из 4 типов упражнений)
    ProgressScreen.jsx         — Прогресс (XP/streak/достижения)
    DictionaryScreen.jsx       — База
  App.jsx                     — управляет активной вкладкой, показывает/прячет нав
apps-script/                 — бэкенд (Google Apps Script), см. apps-script/README.md
.github/workflows/deploy.yml — облачная сборка и публикация
```

## Следующий шаг

Бэкенд — см. `apps-script/README.md` (тоже полностью в браузере, без локальной машины).
После деплоя бэкенда и публикации фронта через шаги выше — вшить `getQueue`/`submitAnswer`
из `api.js` в `TrainerScreen.jsx` вместо демо-очереди.
