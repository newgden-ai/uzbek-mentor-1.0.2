// Превращает слово из базы (ru, uz, examples, stage) в объект упражнения —
// в один из 4 форматов, которые уже умеют рендерить компоненты в TrainerScreen.
// pool — остальные слова того же запроса, нужны только чтобы взять неверные варианты.

function sample(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

const MIN_DISTRACTORS = 3; // всегда 1 верный + минимум 3 неверных = 4 варианта

export function buildChoice(word, pool) {
  const candidates = pool.filter((w) => w.id !== word.id && w.ru !== word.ru);
  if (candidates.length < MIN_DISTRACTORS) return null; // недостаточно слов для честного выбора — пропускаем этот тип
  const distractors = sample(candidates, MIN_DISTRACTORS).map((w) => ({ text: w.ru, correct: false }));
  const options = sample([{ text: word.ru, correct: true }, ...distractors], MIN_DISTRACTORS + 1);
  return {
    type: "choice",
    wordId: word.id,
    wordStage: word.stage || 0,
    prompt: "Выбери перевод",
    source: word.uz,
    audioUrl: word.audioUrl || "",
    options,
  };
}

function buildFillBlank(word, pool) {
  const ex = word.examples?.[0];
  if (!ex || !ex.uz.includes(word.uz)) return null;
  const candidates = pool.filter((w) => w.id !== word.id && w.uz !== word.uz);
  if (candidates.length < MIN_DISTRACTORS) return null;
  const [before, ...rest] = ex.uz.split(word.uz);
  const after = rest.join(word.uz);
  const distractors = sample(candidates, MIN_DISTRACTORS).map((w) => w.uz);
  return {
    type: "fillBlank",
    wordId: word.id,
    wordStage: word.stage || 0,
    prompt: "Вставь пропущенное слово",
    before: before.trim(),
    after: after.trim(),
    ru: ex.ru,
    audioUrl: ex.audioUrl || "",
    options: sample([word.uz, ...distractors], MIN_DISTRACTORS + 1),
    correct: word.uz,
  };
}

function buildAssembly(word) {
  const ex = word.examples?.[0];
  if (!ex) return null;
  const correct = ex.uz.split(" ");
  if (correct.length < 3) return null;
  const decoy = ["ham", "yana", "juda"].filter((w) => !correct.includes(w)).slice(0, 2);
  return {
    type: "assembly",
    wordId: word.id,
    wordStage: word.stage || 0,
    prompt: "Собери предложение",
    ru: ex.ru,
    audioUrl: ex.audioUrl || "",
    correct,
    bank: sample([...correct, ...decoy], correct.length + decoy.length),
  };
}

function buildTranslateToUz(word) {
  return {
    type: "translateToUz",
    wordId: word.id,
    wordStage: word.stage || 0,
    prompt: "Переведи на узбекский",
    source: word.ru,
    accept: [word.uz.toLowerCase()],
    word: word.uz,
    audioUrl: word.audioUrl || "",
  };
}

function buildSpell(word) {
  const letters = word.uz.replace(/\s/g, "").split("");
  if (letters.length < 3) return null;
  return {
    type: "spell",
    wordId: word.id,
    wordStage: word.stage || 0,
    prompt: "Собери слово из букв",
    ru: word.ru,
    correct: letters,
    bank: sample(letters, letters.length),
  };
}

// Пробует построить упражнение случайного типа, с фоллбеком на перевод
// (он единственный не требует ни примеров, ни соседних слов — значит всегда сработает).
export function buildExercise(word, pool) {
  const candidates = [
    () => buildTranslateToUz(word),
    () => buildChoice(word, pool),
    () => buildFillBlank(word, pool),
    () => buildAssembly(word),
    () => buildSpell(word),
  ];
  const order = sample(candidates, candidates.length);
  for (const build of order) {
    const ex = build();
    if (ex) return ex;
  }
  return buildTranslateToUz(word);
}

// items приходят от getQueue уже помечены mode: "learn" (карточка изучения,
// см. 1.6) | "exercise" (обычное задание). Для learn — не строим упражнение,
// отдаём как есть, TrainerScreen сам решит, что с этим делать.
export function buildQueueFromWords(items) {
  return items.map((item) => {
    if (item.mode === "learn") return { ...item, type: "learn" };
    return buildExercise(item, items);
  });
}
