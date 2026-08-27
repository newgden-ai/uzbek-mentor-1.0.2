// Превращает слово из базы (ru, uz, examples, stage) в объект упражнения —
// в один из 4 форматов, которые уже умеют рендерить компоненты в TrainerScreen.
// pool — остальные слова того же запроса, нужны только чтобы взять неверные варианты.

function sample(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

export function buildChoice(word, pool) {
  const distractors = sample(pool.filter((w) => w.id !== word.id), 3).map((w) => ({ text: w.ru, correct: false }));
  const options = sample([{ text: word.ru, correct: true }, ...distractors], distractors.length + 1);
  return {
    type: "choice",
    wordId: word.id,
    wordStage: word.stage || 0,
    prompt: "Выбери перевод",
    source: word.uz,
    options,
  };
}

function buildFillBlank(word, pool) {
  const ex = word.examples?.[0];
  if (!ex || !ex.uz.includes(word.uz)) return null;
  const [before, ...rest] = ex.uz.split(word.uz);
  const after = rest.join(word.uz);
  const distractors = sample(pool.filter((w) => w.id !== word.id), 3).map((w) => w.uz);
  return {
    type: "fillBlank",
    wordId: word.id,
    wordStage: word.stage || 0,
    prompt: "Вставь пропущенное слово",
    before: before.trim(),
    after: after.trim(),
    ru: ex.ru,
    options: sample([word.uz, ...distractors], distractors.length + 1),
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
  };
}

// Пробует построить упражнение случайного типа, с фоллбеком на choice
// (он единственный не требует примеров-предложений, значит всегда сработает).
export function buildExercise(word, pool) {
  const candidates = [
    () => buildTranslateToUz(word),
    () => buildChoice(word, pool),
    () => buildFillBlank(word, pool),
    () => buildAssembly(word),
  ];
  const order = sample(candidates, candidates.length);
  for (const build of order) {
    const ex = build();
    if (ex) return ex;
  }
  return buildChoice(word, pool);
}

export function buildQueueFromWords(words) {
  return words.map((w) => buildExercise(w, words));
}
