import React, { useState, useEffect, useCallback } from "react";
import { Heart, Volume2, Check, RotateCcw, X, Lightbulb, SkipForward, Trophy, Loader2, AlertTriangle, BookOpen } from "lucide-react";
import { tokens } from "../theme.js";
import { LandmarkStage, StagePopover } from "../components/LandmarkStage.jsx";
import { buildPlacementQueue } from "../data/placement.js";
import { buildQueueFromWords } from "../data/exerciseBuilder.js";
import { usePlayer } from "../utils/audio.js";
import {
  getQueue as apiGetQueue,
  getWords as apiGetWords,
  getTopicProgress,
  getHintStatus,
  useHint as apiUseHint,
  grantAdHint,
  submitAnswer,
  introduceWord,
  getCheckpointQueue,
  completeCheckpoint,
} from "../api.js";

const HELPERS_DELAY_MS = 4000;

// ---------------------------------------------------------------------------
// 2 — AdsGram (реклама за подсказку). Раньше grantAdHint() вызывался сразу
// по клику, без реального показа рекламы — заглушка для тестирования.
// SDK подключён тегом в index.html (window.Adsgram появляется оттуда).
// blockId берётся из VITE_ADSGRAM_BLOCK_ID (см. .env.example) — без него
// кнопка "+1 за рекламу" в HelpersBar просто не показывает рекламу и не
// начисляет подсказку, а сообщает, что реклама недоступна (никакого фейка).
// debug: true в режиме разработки (import.meta.env.DEV) — тестовые баннеры,
// без реальных показов; в собранном для GitHub Pages проде — обязательно false.
// ---------------------------------------------------------------------------
const ADSGRAM_BLOCK_ID = import.meta.env.VITE_ADSGRAM_BLOCK_ID;
let adController = null;
function getAdController() {
  if (!ADSGRAM_BLOCK_ID || typeof window === "undefined" || !window.Adsgram) return null;
  if (!adController) {
    adController = window.Adsgram.init({
      blockId: ADSGRAM_BLOCK_ID,
      debug: Boolean(import.meta.env.DEV),
    });
  }
  return adController;
}

// Показывает rewarded-баннер и резолвится ТОЛЬКО если пользователь досмотрел
// его до конца (так по документации AdsGram: show() resolve = досмотрено,
// reject = ошибка/пропуск/недоступно). Никогда не бросает исключение наружу —
// вызывающий код всегда получает { ok, reason }.
async function showRewardedAd() {
  const controller = getAdController();
  if (!controller) return { ok: false, reason: "unavailable" };
  try {
    await controller.show();
    return { ok: true };
  } catch {
    return { ok: false, reason: "skipped" };
  }
}

// Простое воспроизведение — <audio>/Audio() играют кросс-доменные файлы без
// CORS-заголовков (в отличие от fetch/Web Audio API), так что ссылки с
// Google Drive должны работать напрямую.
function useHelpersVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), HELPERS_DELAY_MS);
    return () => clearTimeout(t);
  }, []);
  return visible;
}

function TopBar({ progress, stage, onBadgeClick, onExit }) {
  return (
    <div className="px-5 pt-5 pb-2 flex items-center gap-2.5 shrink-0">
      <button onClick={onExit} aria-label="Закрыть урок">
        <X size={22} color={tokens.textSecondary} />
      </button>
      <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: tokens.track }}>
        <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: tokens.accentGradient }} />
      </div>
      <button onClick={onBadgeClick} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: tokens.card }}>
        <LandmarkStage stage={stage} size={26} />
      </button>
      <div className="flex items-center gap-1">
        <Heart size={17} color={tokens.wrong} fill={tokens.wrong} />
        <span className="text-[13px] font-bold" style={{ color: tokens.textPrimary }}>4</span>
      </div>
    </div>
  );
}

function HelpersBar({ visible, checked, onHint, hintUsed, onSkip, hintBudget, onWatchAd, adBusy, adAvailable }) {
  if (!visible || checked) return null;
  const exhausted = hintBudget && hintBudget.remaining === 0;

  return (
    <div className="px-6 pb-2 flex flex-col gap-1.5 shrink-0">
    <div className="flex items-center gap-2 flex-wrap">
      {!exhausted ? (
        <button
          onClick={onHint}
          disabled={hintUsed}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full font-bold text-[12.5px]"
          style={{ background: hintUsed ? tokens.track : tokens.card, color: hintUsed ? tokens.textSecondary : tokens.accentOchre }}
        >
          <Lightbulb size={14} /> Подсказка
          {hintBudget?.remaining != null && <span style={{ opacity: 0.7 }}>· {hintBudget.remaining}</span>}
        </button>
      ) : !adAvailable ? (
        <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-full font-bold text-[12.5px]" style={{ background: tokens.track, color: tokens.textSecondary }}>
          <Lightbulb size={14} /> Подсказки закончились
        </div>
      ) : (
        <button
          onClick={onWatchAd}
          disabled={adBusy}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full font-bold text-[12.5px]"
          style={{ background: tokens.accentGradient, color: "#FBF9F4", opacity: adBusy ? 0.7 : 1 }}
        >
          <Lightbulb size={14} /> {adBusy ? "Загрузка рекламы…" : "+1 за рекламу"}
        </button>
      )}
      <button
        onClick={onSkip}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-full font-bold text-[12.5px]"
        style={{ background: tokens.card, color: tokens.textSecondary }}
      >
        <SkipForward size={14} /> Пропустить
      </button>
    </div>
    {hintBudget?.adError === "skipped" && (
      <span className="text-[11.5px] font-semibold px-1" style={{ color: tokens.textSecondary }}>
        Реклама не досмотрена до конца — подсказка не начислена
      </span>
    )}
    </div>
  );
}

function TryAgainBar({ show }) {
  if (!show) return null;
  return (
    <div className="px-6 pb-2 shrink-0">
      <p className="text-[12.5px] font-bold" style={{ color: tokens.wrong }}>Неверно — попробуй ещё раз</p>
    </div>
  );
}

// checked: null | 'correct' | 'skipped'. wasCorrect передаём наверх отдельно —
// пропуск НЕ штрафует балл слова (просто не засчитывается), в отличие от ошибки.
function FeedbackBar({ checked, correctText, onNext }) {
  if (!checked) return null;
  const isCorrect = checked === "correct";
  const bg = isCorrect ? tokens.correctBg : tokens.track;
  const fg = isCorrect ? tokens.correct : tokens.textSecondary;

  return (
    <div className="px-4 pb-4 shrink-0">
      <div className="rounded-2xl px-5 py-4 flex items-center justify-between" style={{ background: bg }}>
        <div className="flex items-center gap-3">
          {isCorrect ? <Check size={22} color={fg} strokeWidth={3} /> : <SkipForward size={20} color={fg} />}
          <div>
            <p className="font-extrabold text-[14px]" style={{ color: fg }}>{isCorrect ? "Точно!" : "Пропущено"}</p>
            {!isCorrect && correctText && <p className="text-[12px]" style={{ color: tokens.textSecondary }}>Верно: {correctText}</p>}
          </div>
        </div>
        <button onClick={onNext} className="px-4 py-2 rounded-xl font-bold text-[13px]" style={{ background: isCorrect ? tokens.accentGradient : tokens.textSecondary, color: "#FBF9F4" }}>
          Дальше
        </button>
      </div>
    </div>
  );
}

// ---- 1.6 — карточка изучения нового слова, до упражнений ----
// 2 — добавлена кнопка "Повторить": в отличие от "Знаю" она НЕ отмечает слово
// как показанное (introduceWord не вызывается) и возвращает его обратно в
// подборку через несколько карточек — чтобы слово гарантированно показалось
// ещё раз в этой же сессии, прежде чем считаться изученным.
function LearnCard({ ex, onDone, onRepeat, onSaveError }) {
  const example = ex.examples?.[0];
  const play = usePlayer();
  const [busy, setBusy] = useState(false); // 1 — видимая индикация вместо "непонятного зависания" на время запроса к серверу
  return (
    <div className="flex-1 flex flex-col px-6 pt-6">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Новое слово</p>
      <div className="flex-1 flex flex-col items-center justify-center gap-4 -mt-6">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: tokens.cardActive }}>
          <BookOpen size={24} color={tokens.accentTeal} />
        </div>
        <div className="text-center">
          <button onClick={() => play(ex.audioUrl)} className="mb-1 w-9 h-9 rounded-full flex items-center justify-center mx-auto" style={{ background: tokens.cardActive }}>
            <Volume2 size={16} color={tokens.accentTeal} />
          </button>
          <h1 className="text-[28px] font-extrabold" style={{ color: tokens.textPrimary }}>{ex.uz}</h1>
          <p className="text-[16px] mt-1" style={{ color: tokens.textSecondary }}>{ex.ru}</p>
        </div>
        {example && (
          <div className="rounded-2xl px-5 py-4 mt-2 max-w-xs" style={{ background: tokens.card }}>
            <button onClick={() => play(example.audioUrl)} className="flex items-center gap-1.5 mb-1.5">
              <Volume2 size={13} color={tokens.accentTeal} />
            </button>
            <p className="text-[14px] font-semibold text-center" style={{ color: tokens.textPrimary }}>{example.uz}</p>
            <p className="text-[12.5px] text-center mt-1" style={{ color: tokens.textSecondary }}>{example.ru}</p>
          </div>
        )}
      </div>
      <div className="px-2 pb-4 flex gap-2.5">
        <button
          disabled={busy}
          onClick={() => onRepeat(ex)}
          className="flex-1 rounded-2xl py-4 font-extrabold text-[14px] flex items-center justify-center gap-1.5"
          style={{ background: tokens.card, color: tokens.textSecondary, opacity: busy ? 0.5 : 1 }}
        >
          <RotateCcw size={15} /> Повторить
        </button>
        <button
          disabled={busy}
          onClick={async () => {
            // 1 — раньше introduceWord() не дожидались перед переходом дальше:
            // если это было последнее слово в подборке, TrainerScreen сразу
            // запрашивал у сервера свежую подборку (см. handleDone), и та
            // запись introduceWord могла ещё не успеть сохраниться в таблице —
            // сервер отдавал слово снова как "новое" (learn), а не как
            // упражнение. Теперь дожидаемся подтверждения от сервера — а
            // apiGet() (api.js) больше не может зависнуть бесконечно (тайм-аут
            // 15с) и try/finally гарантирует, что кнопка не останется "мёртвой",
            // даже если запрос всё же сорвётся.
            setBusy(true);
            try {
              const res = await introduceWord(ex.wordId);
              // 1 — раньше результат introduceWord() вообще не проверялся: если
              // сервер вернул {error: ...} (например, ещё старый бэкенд без
              // этого action, либо реальная ошибка сети), слово ВЫГЛЯДЕЛО
              // изученным на экране, но на сервере ничего не сохранялось —
              // и следующая подгрузка подборки просто возвращала его же снова.
              if (res?.error) onSaveError?.(res.error);
            } finally {
              setBusy(false);
              onDone(false, false);
            }
          }}
          className="flex-1 rounded-2xl py-4 font-extrabold text-[15px] flex items-center justify-center gap-1.5"
          style={{ background: tokens.accentGradient, color: "#FBF9F4", opacity: busy ? 0.7 : 1 }}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Знаю →"}
        </button>
      </div>
    </div>
  );
}

// ---- Сборка предложения — на ошибке тайлы возвращаются в банк ----
function Assembly({ ex, onDone, hintBudget, onRequestHint, onWatchAd, adBusy, adAvailable }) {
  const [bank, setBank] = useState(ex.bank);
  const [answer, setAnswer] = useState([]);
  const [checked, setChecked] = useState(null);
  const [showTryAgain, setShowTryAgain] = useState(false);
  const [hadError, setHadError] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const helpersVisible = useHelpersVisible();
  const play = usePlayer();

  const pickTile = (word, idx) => { if (checked) return; setAnswer([...answer, { word, key: idx }]); setBank(bank.filter((_, i) => i !== idx)); };
  const removeTile = (i) => { if (checked) return; setBank([...bank, answer[i].word]); setAnswer(answer.filter((_, idx) => idx !== i)); };

  const check = () => {
    if (answer.map((a) => a.word).join(" ") === ex.correct.join(" ")) {
      setChecked("correct");
    } else {
      setHadError(true);
      setShowTryAgain(true);
      setBank(ex.bank);
      setAnswer([]);
      setTimeout(() => setShowTryAgain(false), 1800);
    }
  };
  const skip = () => setChecked("skipped");
  const handleHint = async () => {
    const res = await onRequestHint();
    if (res.allowed) setHintUsed(true);
  };
  const nextCorrectWord = ex.correct[answer.length];

  return (
    <>
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{ex.prompt}</p>
        <div className="flex items-start gap-3 mt-3">
          <button onClick={() => play(ex.audioUrl)} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: tokens.card }}><Volume2 size={17} color={tokens.accentTeal} /></button>
          <h1 className="text-[22px] font-extrabold leading-snug pt-1.5" style={{ color: tokens.textPrimary }}>{ex.ru}</h1>
        </div>
        <div className="mt-8">
          <div className="min-h-[52px] rounded-2xl flex flex-wrap gap-2 items-center px-3 py-2.5" style={{ background: tokens.card, border: `2px dashed ${tokens.track}` }}>
            {answer.length === 0 && <span className="text-[13px] px-2" style={{ color: tokens.textSecondary }}>Нажимай на слова снизу</span>}
            {answer.map((a, i) => (
              <button key={a.key} onClick={() => removeTile(i)} className="px-3.5 py-2 rounded-xl font-bold text-[14px]" style={{ background: tokens.cardActive, color: tokens.textPrimary, border: `1px solid ${tokens.accentTeal}40` }}>{a.word}</button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2.5 justify-center mt-6">
          {bank.map((word, i) => {
            const isHinted = hintUsed && word === nextCorrectWord;
            return (
              <button key={word + i} onClick={() => pickTile(word, i)} className="px-4 py-2.5 rounded-xl font-bold text-[14px]" style={{ background: isHinted ? tokens.correctBg : tokens.card, color: isHinted ? tokens.correct : tokens.textPrimary, border: `1px solid ${isHinted ? tokens.correct + "70" : tokens.track}` }}>{word}</button>
            );
          })}
        </div>
      </div>
      <TryAgainBar show={showTryAgain} />
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={hintUsed} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} adBusy={adBusy} adAvailable={adAvailable} />
      {!checked && (
        <div className="px-4 pb-4 shrink-0">
          <button onClick={check} disabled={answer.length === 0} className="w-full rounded-2xl py-4 font-extrabold text-[15px] tracking-wide" style={{ background: answer.length === 0 ? tokens.track : tokens.accentGradient, color: answer.length === 0 ? tokens.textSecondary : "#FBF9F4" }}>ПРОВЕРИТЬ</button>
        </div>
      )}
      <FeedbackBar checked={checked} correctText={ex.correct.join(" ")} onNext={() => onDone(checked === "correct" && !hadError, checked === "skipped")} />
    </>
  );
}

// ---- 2.3 — собери слово из букв: на ошибке верно стоящие буквы остаются на
// месте, остальные уходят обратно вниз для повторной раскладки ----
function Spell({ ex, onDone, hintBudget, onRequestHint, onWatchAd, adBusy, adAvailable }) {
  const [slots, setSlots] = useState(Array(ex.correct.length).fill(null)); // буква или null
  const [bank, setBank] = useState(ex.bank.map((letter, i) => ({ letter, key: i })));
  const [checked, setChecked] = useState(null);
  const [showTryAgain, setShowTryAgain] = useState(false);
  const [hadError, setHadError] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const helpersVisible = useHelpersVisible();
  const play = usePlayer();

  const firstEmpty = slots.findIndex((s) => s === null);

  const placeLetter = (tile) => {
    if (checked || firstEmpty === -1) return;
    const newSlots = [...slots];
    newSlots[firstEmpty] = tile.letter;
    setSlots(newSlots);
    setBank(bank.filter((t) => t.key !== tile.key));
  };
  const clearSlot = (i) => {
    if (checked || slots[i] === null) return;
    setBank([...bank, { letter: slots[i], key: `back-${i}-${Date.now()}` }]);
    const newSlots = [...slots];
    newSlots[i] = null;
    setSlots(newSlots);
  };

  const check = () => {
    if (slots.some((s) => s === null)) return;
    if (slots.join("") === ex.correct.join("")) {
      setChecked("correct");
      return;
    }
    setHadError(true);
    setShowTryAgain(true);
    // верно стоящие буквы остаются, остальные — обратно в банк для новой раскладки
    const keptSlots = slots.map((s, i) => (s === ex.correct[i] ? s : null));
    const returned = slots
      .map((s, i) => ({ letter: s, i }))
      .filter(({ i }) => keptSlots[i] === null)
      .map(({ letter }, k) => ({ letter, key: `retry-${Date.now()}-${k}` }));
    setSlots(keptSlots);
    setBank(sample(returned, returned.length));
    setTimeout(() => setShowTryAgain(false), 1800);
  };
  function sample(arr, n) { return [...arr].sort(() => Math.random() - 0.5).slice(0, n); }

  const skip = () => setChecked("skipped");
  const handleHint = async () => {
    const res = await onRequestHint();
    if (!res.allowed || firstEmpty === -1) return;
    setHintUsed(true);
    const correctLetter = ex.correct[firstEmpty];
    const tile = bank.find((t) => t.letter === correctLetter);
    if (tile) placeLetter(tile);
  };

  return (
    <>
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{ex.prompt}</p>
        <p className="text-[15px] font-semibold mt-2" style={{ color: tokens.textSecondary }}>{ex.ru}</p>

        <div className="flex flex-wrap gap-2 justify-center mt-8">
          {slots.map((letter, i) => (
            <button
              key={i}
              onClick={() => clearSlot(i)}
              className="w-10 h-11 rounded-xl flex items-center justify-center font-extrabold text-[17px]"
              style={{
                background: letter ? tokens.cardActive : tokens.card,
                color: tokens.textPrimary,
                border: `2px ${letter ? "solid" : "dashed"} ${letter ? tokens.accentTeal + "50" : tokens.track}`,
              }}
            >
              {letter || ""}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2.5 justify-center mt-8">
          {bank.map((tile) => (
            <button key={tile.key} onClick={() => placeLetter(tile)} className="w-10 h-11 rounded-xl font-extrabold text-[17px]" style={{ background: tokens.card, color: tokens.textPrimary, border: `1px solid ${tokens.track}` }}>
              {tile.letter}
            </button>
          ))}
        </div>
      </div>
      <TryAgainBar show={showTryAgain} />
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={hintUsed} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} adBusy={adBusy} adAvailable={adAvailable} />
      {!checked && (
        <div className="px-4 pb-4 shrink-0">
          <button onClick={check} disabled={slots.some((s) => s === null)} className="w-full rounded-2xl py-4 font-extrabold text-[15px] tracking-wide" style={{ background: slots.some((s) => s === null) ? tokens.track : tokens.accentGradient, color: slots.some((s) => s === null) ? tokens.textSecondary : "#FBF9F4" }}>ПРОВЕРИТЬ</button>
        </div>
      )}
      <FeedbackBar checked={checked} correctText={ex.correct.join("")} onNext={() => onDone(checked === "correct" && !hadError, checked === "skipped")} />
    </>
  );
}

// ---- Выбор варианта — неверный вариант гаснет и исключается ----
function Choice({ ex, onDone, hintBudget, onRequestHint, onWatchAd, adBusy, adAvailable }) {
  const [checked, setChecked] = useState(null);
  const [wrongPicks, setWrongPicks] = useState([]);
  const [hadError, setHadError] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const helpersVisible = useHelpersVisible();
  const play = usePlayer();

  const pick = (opt, i) => {
    if (checked || wrongPicks.includes(i)) return;
    if (opt.correct) setChecked("correct");
    else { setHadError(true); setWrongPicks([...wrongPicks, i]); }
  };
  const skip = () => setChecked("skipped");
  const handleHint = async () => {
    const res = await onRequestHint();
    if (res.allowed) setHintUsed(true);
  };

  return (
    <>
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{ex.prompt}</p>
        <div className="flex items-start gap-3 mt-3">
          <button onClick={() => play(ex.audioUrl)} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: tokens.card }}><Volume2 size={17} color={tokens.accentTeal} /></button>
          <h1 className="text-[22px] font-extrabold leading-snug pt-1.5" style={{ color: tokens.textPrimary }}>{ex.source}</h1>
        </div>
        <div className="flex flex-col gap-2.5 mt-8">
          {ex.options.map((opt, i) => {
            const isWrongPick = wrongPicks.includes(i);
            const isHinted = hintUsed && !checked && opt.correct;
            const isCorrectRevealed = checked === "correct" && opt.correct;
            let bg = tokens.card, border = "1px solid transparent", color = tokens.textPrimary, opacity = 1;
            if (isWrongPick) { bg = tokens.wrongBg; border = `1px solid ${tokens.wrong}40`; color = tokens.wrong; opacity = 0.6; }
            else if (isCorrectRevealed || isHinted) { bg = tokens.correctBg; border = `1px solid ${tokens.correct}55`; color = tokens.correct; }
            return (
              <button key={i} onClick={() => pick(opt, i)} disabled={isWrongPick || checked} className="text-left px-4 py-3.5 rounded-2xl font-semibold text-[14.5px]" style={{ background: bg, border, color, opacity }}>
                {opt.text}
              </button>
            );
          })}
        </div>
      </div>
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={hintUsed} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} adBusy={adBusy} adAvailable={adAvailable} />
      <FeedbackBar checked={checked} correctText={ex.options.find((o) => o.correct).text} onNext={() => onDone(checked === "correct" && !hadError, checked === "skipped")} />
    </>
  );
}

// ---- Вставка слова — так же: неверный вариант гаснет ----
function FillBlank({ ex, onDone, hintBudget, onRequestHint, onWatchAd, adBusy, adAvailable }) {
  const [checked, setChecked] = useState(null);
  const [picked, setPicked] = useState(null);
  const [wrongPicks, setWrongPicks] = useState([]);
  const [hadError, setHadError] = useState(false);
  const [hintUsed, setHintUsed] = useState(false);
  const helpersVisible = useHelpersVisible();
  const play = usePlayer();

  const pick = (word) => {
    if (checked || wrongPicks.includes(word)) return;
    if (word === ex.correct) { setPicked(word); setChecked("correct"); }
    else { setHadError(true); setWrongPicks([...wrongPicks, word]); }
  };
  const skip = () => setChecked("skipped");
  const handleHint = async () => {
    const res = await onRequestHint();
    if (res.allowed) setHintUsed(true);
  };

  return (
    <>
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{ex.prompt}</p>
        <p className="text-[13px] mt-3" style={{ color: tokens.textSecondary }}>{ex.ru}</p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-[20px] font-extrabold" style={{ color: tokens.textPrimary }}>{ex.before}</span>
          <span className="min-w-[90px] text-center px-3 py-1.5 rounded-xl text-[16px] font-extrabold" style={{ background: checked === "correct" ? tokens.correctBg : tokens.card, color: checked === "correct" ? tokens.correct : tokens.textSecondary, border: `2px dashed ${tokens.track}` }}>{picked || "..."}</span>
          <span className="text-[20px] font-extrabold" style={{ color: tokens.textPrimary }}>{ex.after}</span>
        </div>
        <div className="flex flex-wrap gap-2.5 justify-center mt-10">
          {ex.options.map((word) => {
            const isWrongPick = wrongPicks.includes(word);
            const isHinted = hintUsed && !checked && word === ex.correct;
            return (
              <button
                key={word}
                onClick={() => pick(word)}
                disabled={isWrongPick || checked}
                className="px-4 py-2.5 rounded-xl font-bold text-[14px]"
                style={{
                  background: isWrongPick ? tokens.wrongBg : isHinted ? tokens.correctBg : tokens.card,
                  color: isWrongPick ? tokens.wrong : isHinted ? tokens.correct : tokens.textPrimary,
                  border: `1px solid ${isWrongPick ? tokens.wrong + "40" : isHinted ? tokens.correct + "70" : tokens.track}`,
                  opacity: isWrongPick ? 0.6 : 1,
                }}
              >
                {word}
              </button>
            );
          })}
        </div>
      </div>
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={hintUsed} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} adBusy={adBusy} adAvailable={adAvailable} />
      <FeedbackBar checked={checked} correctText={ex.correct} onNext={() => onDone(checked === "correct" && !hadError, checked === "skipped")} />
    </>
  );
}

function diffWords(typed, expected) {
  const t = typed.trim().split(/\s+/).filter(Boolean);
  const e = expected.trim().split(/\s+/).filter(Boolean);
  return e.map((w, i) => ({ typed: t[i] || "", expected: w, ok: (t[i] || "").toLowerCase() === w.toLowerCase() }));
}

function TranslateToUz({ ex, onDone, hintBudget, onRequestHint, onWatchAd, adBusy, adAvailable }) {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(null);
  const [diff, setDiff] = useState(null);
  const [hadError, setHadError] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const helpersVisible = useHelpersVisible();
  const play = usePlayer();

  const check = () => {
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    if (ex.accept.includes(normalized)) {
      setChecked("correct");
      setDiff(null);
    } else {
      setHadError(true);
      setDiff(diffWords(value, ex.accept[0]));
    }
  };
  const skip = () => setChecked("skipped");
  const handleHint = async () => {
    const res = await onRequestHint();
    if (res.allowed) setRevealedCount((c) => Math.min(c + 1, ex.word.length));
  };

  return (
    <>
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{ex.prompt}</p>
        <div className="flex items-start gap-3 mt-3">
          <button onClick={() => play(ex.audioUrl)} className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: tokens.card }}><Volume2 size={17} color={tokens.accentTeal} /></button>
          <h1 className="text-[22px] font-extrabold leading-snug pt-1.5" style={{ color: tokens.textPrimary }}>{ex.source}</h1>
        </div>
        <input
          value={value}
          onChange={(e) => { if (checked) return; setValue(e.target.value); setDiff(null); }}
          placeholder={ex.placeholder || "Напиши перевод на узбекском..."}
          className="w-full mt-8 rounded-2xl px-4 py-3.5 text-[16px] font-semibold outline-none"
          style={{ background: tokens.card, color: tokens.textPrimary, border: `2px solid ${diff ? tokens.wrong + "70" : "transparent"}` }}
        />
        {diff && (
          <div className="flex flex-wrap gap-1.5 mt-2 px-1">
            {diff.map((d, i) => (
              <span key={i} className="px-2 py-1 rounded-lg text-[13px] font-semibold" style={{ background: d.typed ? (d.ok ? tokens.correctBg : tokens.wrongBg) : tokens.track, color: d.typed ? (d.ok ? tokens.correct : tokens.wrong) : tokens.textSecondary }}>
                {d.typed || "…"}
              </span>
            ))}
          </div>
        )}
        {revealedCount > 0 && (
          <div className="flex items-center gap-1.5 mt-3 px-1">
            {ex.word.split("").map((letter, i) => (
              <span key={i} className="w-7 h-8 rounded-lg flex items-center justify-center font-extrabold text-[14px]" style={{ background: i < revealedCount ? tokens.correctBg : tokens.card, color: i < revealedCount ? tokens.correct : tokens.textSecondary, border: `1px solid ${tokens.track}` }}>
                {i < revealedCount ? letter : "·"}
              </span>
            ))}
          </div>
        )}
      </div>
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={revealedCount >= ex.word.length} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} adBusy={adBusy} adAvailable={adAvailable} />
      {!checked && (
        <div className="px-4 pb-4 shrink-0">
          <button onClick={check} disabled={!value.trim()} className="w-full rounded-2xl py-4 font-extrabold text-[15px] tracking-wide" style={{ background: !value.trim() ? tokens.track : tokens.accentGradient, color: !value.trim() ? tokens.textSecondary : "#FBF9F4" }}>ПРОВЕРИТЬ</button>
        </div>
      )}
      <FeedbackBar checked={checked} correctText={ex.accept[0]} onNext={() => onDone(checked === "correct" && !hadError, checked === "skipped")} />
    </>
  );
}

const RENDERERS = { assembly: Assembly, choice: Choice, fillBlank: FillBlank, translateToUz: TranslateToUz, translateToRu: TranslateToUz, spell: Spell, learn: LearnCard };

function PlacementResult({ score, total, level, onFinish }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: tokens.accentGradient }}>
        <Trophy size={28} color="#FBF9F4" />
      </div>
      <h1 className="text-2xl font-extrabold" style={{ color: tokens.textPrimary }}>Проверка пройдена</h1>
      <p className="text-[14px] mt-2" style={{ color: tokens.textSecondary }}>
        {score} из {total} верно — уровень {level} подтверждён, приложение подстроится под него
      </p>
      <button onClick={onFinish} className="mt-6 rounded-full px-8 py-3.5 font-bold text-[15px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
        В приложение
      </button>
    </div>
  );
}

// 9 — итог контрольной проверки каждые 500 слов.
function CheckpointResult({ score, total, onFinish }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: tokens.accentGradient }}>
        <Trophy size={28} color="#FBF9F4" />
      </div>
      <h1 className="text-2xl font-extrabold" style={{ color: tokens.textPrimary }}>Проверка пройдена</h1>
      <p className="text-[14px] mt-2" style={{ color: tokens.textSecondary }}>
        {score} из {total} верно — материал закреплён, продолжай заниматься
      </p>
      <button onClick={onFinish} className="mt-6 rounded-full px-8 py-3.5 font-bold text-[15px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
        В приложение
      </button>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <Loader2 size={28} color={tokens.accentTeal} className="animate-spin" />
      <p className="text-[13px]" style={{ color: tokens.textSecondary }}>Загружаем задания…</p>
    </div>
  );
}

function EmptyState({ onExit, error, completed }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
      {error ? <AlertTriangle size={28} color={tokens.wrong} /> : completed ? <Trophy size={28} color={tokens.accentTeal} /> : null}
      <p className="font-bold text-[15px]" style={{ color: tokens.textPrimary }}>
        {error ? "Не удалось загрузить задания" : completed ? "Отличная работа!" : "Пока нечего повторять"}
      </p>
      <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
        {error || (completed ? "Ты прошёл всё, что доступно прямо сейчас — новые слова и повторы появятся по расписанию" : "В этой подборке не нашлось слов с примерами для упражнений")}
      </p>
      <button onClick={onExit} className="mt-2 rounded-full px-6 py-2.5 font-bold text-[13px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
        Назад
      </button>
    </div>
  );
}

export default function TrainerScreen({ onExit, topicFilter, placementLevel, onFinishPlacement, mode = "all" }) {
  const [index, setIndex] = useState(0);
  const [showBadge, setShowBadge] = useState(false);
  const [score, setScore] = useState(0);
  const [queue, setQueue] = useState(null);
  const [loadError, setLoadError] = useState(null);
  // 1 — раньше ошибки от introduceWord()/submitAnswer() (например, если
  // бэкенд ещё старый и не знает такое действие, либо реально сорвалась
  // сеть) уходили ТОЛЬКО в console.warn — то есть были невидимы человеку без
  // подключённого удалённого дебага. Слово тогда "как бы" отмечалось изученным
  // на экране, но сервер это не сохранял, и это выглядело как "по кругу,
  // ничего не меняется" без единой подсказки, что где-то реально упала ошибка.
  // Теперь такую ошибку видно прямо в приложении баннером — можно
  // сфотографировать/скопировать точный текст для диагностики.
  const [saveError, setSaveError] = useState(null);
  const [sessionComplete, setSessionComplete] = useState(false); // 3 — подборка кончилась не из-за ошибки, а потому что всё пройдено
  const [hintBudget, setHintBudget] = useState(null);
  const isPlacement = Boolean(placementLevel);
  const isCheckpoint = mode === "checkpoint"; // 9 — контрольная проверка каждые 500 слов

  // 3 — вынесено в переиспользуемую функцию: раньше подборка грузилась с
  // сервера только один раз при заходе на экран, а после того как пользователь
  // проходил её всю, индекс просто "заворачивался" по кругу
  // (queue[index % queue.length]) — та же СТАРАЯ подборка (включая уже
  // показанные карточки "новое слово") крутилась бесконечно. Слова, только
  // что отмеченные "Знаю", не превращались в упражнения на закрепление в
  // рамках этой же сессии, а прогресс/статистика не менялись, потому что
  // submitAnswer (который их обновляет) для них так и не вызывался. Теперь
  // эта функция вызывается заново по достижении конца подборки (см. handleDone) —
  // и подтягивает свежие данные с сервера, где только что изученные слова уже
  // придут как упражнения на закрепление (getQueue на бэкенде это учитывает).
  const loadQueue = useCallback(async () => {
    if (isPlacement) return buildPlacementQueue(placementLevel);
    if (isCheckpoint) {
      const res = await getCheckpointQueue(30);
      if (res.error) throw new Error(res.error);
      return buildQueueFromWords(res.queue || []);
    }
    if (topicFilter?.repeat) {
      // "Повторить всю тему" — она уже пройдена, тут не нужен learn-флоу,
      // сразу задания по всем словам темы.
      //
      // 3.5 — раньше здесь брали слова через getWords(), который отдаёт
      // ТОЛЬКО словарные поля (ru/uz/examples), без личного прогресса —
      // поэтому word.stage всегда был undefined → 0, и "здание" сверху
      // весь повтор темы выглядело так, будто прогресс не меняется вообще.
      // Подмешиваем реальные баллы из getTopicProgress (тот же порядок слов).
      const [res, progressRes] = await Promise.all([
        apiGetWords({ level: topicFilter.level, topic: topicFilter.name }),
        getTopicProgress({ level: topicFilter.level, topic: topicFilter.name }),
      ]);
      if (res.error) throw new Error(res.error);
      const points = progressRes.points || [];
      const withProgress = (res.words || []).map((w, i) => ({
        ...w, mode: "exercise", stage: Math.min(5, points[i] || 0), points: points[i] || 0,
      }));
      return buildQueueFromWords(withProgress);
    }
    if (topicFilter) {
      // 3.1/7 — открытие конкретной подтемы («Часть N») идёт через ту же
      // SRS-логику (due → learn → practice), что и обычная сессия, но
      // ограниченную словами этой части: новые слова сперва показываются
      // карточкой "узнай слово", а не сразу спрашиваются заданием.
      const sub = topicFilter.subLesson;
      const res = await apiGetQueue(999, "all", {
        level: topicFilter.level,
        topic: topicFilter.name,
        offset: sub ? sub.offset : undefined,
        limit: sub ? sub.limit : undefined,
      });
      if (res.error) throw new Error(res.error);
      return buildQueueFromWords(res.queue || []);
    }
    const res = await apiGetQueue(20, mode);
    if (res.error) throw new Error(res.error);
    return buildQueueFromWords(res.queue || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlacement, placementLevel, isCheckpoint, topicFilter?.id, topicFilter?.subLesson?.index, topicFilter?.repeat, topicFilter?.level, topicFilter?.name, mode]);

  useEffect(() => {
    let cancelled = false;
    setQueue(null);
    setLoadError(null);
    setSessionComplete(false);
    setIndex(0);
    setScore(0);

    loadQueue()
      .then(async (built) => {
        if (cancelled) return;
        setQueue(built);
        if (!isPlacement) {
          const status = await getHintStatus();
          if (!cancelled) setHintBudget(status.error ? null : { remaining: status.remaining, tier: status.tier });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(String(err.message || err));
          setQueue([]);
        }
      });
    return () => { cancelled = true; };
  }, [loadQueue]);

  const requestHint = async () => {
    if (isPlacement) return { allowed: true };
    const res = await apiUseHint();
    if (res.error) return { allowed: false };
    setHintBudget({ remaining: res.remaining, tier: hintBudget?.tier });
    return res;
  };

  // 2 — реальный показ rewarded-рекламы через AdsGram. grantAdHint() (бэкенд)
  // теперь вызывается ТОЛЬКО если showRewardedAd() подтвердил, что пользователь
  // досмотрел ролик до конца — раньше подсказка начислялась сразу по клику,
  // без всякого показа рекламы.
  const [adBusy, setAdBusy] = useState(false);
  const watchAd = async () => {
    if (adBusy) return;
    setAdBusy(true);
    try {
      const res = await showRewardedAd();
      if (!res.ok) {
        if (res.reason === "skipped") setHintBudget((b) => (b ? { ...b, adError: "skipped" } : b));
        return;
      }
      await grantAdHint();
      const status = await getHintStatus();
      if (!status.error) setHintBudget({ remaining: status.remaining, tier: status.tier });
    } finally {
      setAdBusy(false);
    }
  };

  if (queue === null) return <LoadingState />;
  if (queue.length === 0) return <EmptyState onExit={onExit} error={loadError} completed={sessionComplete} />;

  const finished = (isPlacement || isCheckpoint) && index >= queue.length;
  if (finished) {
    if (isCheckpoint) {
      return (
        <CheckpointResult
          score={score}
          total={queue.length}
          onFinish={async () => { await completeCheckpoint(); onExit(); }}
        />
      );
    }
    return <PlacementResult score={score} total={queue.length} level={placementLevel} onFinish={() => onFinishPlacement(placementLevel)} />;
  }

  const ex = (isPlacement || isCheckpoint) ? queue[index] : queue[index % queue.length];
  const Renderer = RENDERERS[ex.type];
  const progress = (isPlacement || isCheckpoint) ? index / queue.length : (index % queue.length) / queue.length;

  // wasSkipped: пропуск НЕ трогает баллы слова вообще (ни +, ни -).
  const handleDone = async (wasCorrect, wasSkipped) => {
    if (isPlacement || isCheckpoint) {
      if (wasCorrect) setScore((s) => s + 1);
    }
    const answerPromise = (!isPlacement && ex.wordId && !wasSkipped)
      ? submitAnswer(ex.wordId, wasCorrect).catch((err) => ({ error: String(err.message || err) }))
      : Promise.resolve(null);
    setHintBudget((b) => (b?.adError ? { ...b, adError: null } : b)); // не тянуть сообщение о рекламе в следующее упражнение

    // 3 — по достижении конца подборки (обычная сессия/подтема — не
    // placement/checkpoint, у них своя логика завершения выше) больше НЕ
    // заворачиваем индекс по кругу на ту же старую подборку, а подгружаем
    // свежую с сервера. См. комментарий у loadQueue.
    const isRegularSession = !isPlacement && !isCheckpoint;
    if (isRegularSession && index + 1 >= queue.length) {
      // 1 — раньше запрос свежей подборки запускался СРАЗУ, не дожидаясь
      // подтверждения от submitAnswer() последнего ответа — сервер мог ещё не
      // успеть сохранить его, и в новой подборке слово снова приходило как
      // "новое"/недостаточно закреплённое, создавая видимость, что "ничего не
      // меняется". Теперь ждём подтверждения перед перезапросом — и если
      // ответ не сохранился (queued/error), показываем это явно, а не
      // молча едем дальше как ни в чём не бывало.
      setQueue(null);
      setIndex(0);
      const answerRes = await answerPromise;
      if (answerRes?.error) {
        setSaveError(`Последний ответ не сохранился на сервере: ${answerRes.error}${answerRes.queued ? " (отложен, отправится позже)" : ""}`);
      }
      loadQueue()
        .then((built) => { setQueue(built); setSessionComplete(built.length === 0); })
        .catch((err) => { setLoadError(String(err.message || err)); setQueue([]); setSessionComplete(false); });
    } else {
      setIndex((i) => i + 1);
    }
  };

  // 2 — "Повторить" на карточке нового слова: НЕ отмечает слово изученным
  // (introduceWord не вызывается) и возвращает его в подборку через пару
  // карточек, чтобы оно гарантированно показалось ещё раз в этой сессии.
  const handleRepeatLearn = (word) => {
    setQueue((q) => {
      if (!q) return q;
      const rest = q.slice(0, index).concat(q.slice(index + 1));
      const reinsertAt = Math.min(rest.length, index + 3);
      return [...rest.slice(0, reinsertAt), word, ...rest.slice(reinsertAt)];
    });
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {showBadge && ex.type !== "learn" && <StagePopover stage={ex.wordStage} decay={0} onClose={() => setShowBadge(false)} />}
      <TopBar progress={progress} stage={ex.stage ?? ex.wordStage ?? 0} onBadgeClick={() => setShowBadge(true)} onExit={onExit} />
      {saveError && (
        <div className="px-5 pb-2 shrink-0">
          <div
            role="button"
            onClick={() => setSaveError(null)}
            className="rounded-xl px-3.5 py-2.5 text-[12px] font-semibold leading-snug cursor-pointer"
            style={{ background: `${tokens.wrong}18`, color: tokens.wrong }}
          >
            ⚠️ {saveError} — нажми, чтобы скрыть
          </div>
        </div>
      )}
      {isPlacement && (
        <div className="px-5 pb-2 shrink-0">
          <div className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold" style={{ background: tokens.cardActive, color: tokens.accentTeal }}>
            Проверка уровня {placementLevel} · вопрос {index + 1} из {queue.length}
          </div>
        </div>
      )}
      {isCheckpoint && (
        <div className="px-5 pb-2 shrink-0">
          <div className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold" style={{ background: tokens.cardActive, color: tokens.accentTeal }}>
            Контрольная проверка · {index + 1} из {queue.length}
          </div>
        </div>
      )}
      {topicFilter && !isPlacement && (
        <div className="px-5 pb-2 shrink-0">
          <div className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold" style={{ background: tokens.cardActive, color: tokens.accentTeal }}>
            {topicFilter.subLesson
              ? `«${topicFilter.name}» · ${topicFilter.subLesson.label}`
              : `Повтор темы «${topicFilter.name}»`}
          </div>
        </div>
      )}
      <Renderer key={index} ex={ex} onDone={handleDone} onRepeat={handleRepeatLearn} onSaveError={setSaveError} hintBudget={hintBudget} onRequestHint={requestHint} onWatchAd={watchAd} adBusy={adBusy} adAvailable={Boolean(getAdController())} />
    </div>
  );
}
