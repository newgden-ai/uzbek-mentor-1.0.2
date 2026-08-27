import React, { useState, useEffect } from "react";
import { Heart, Volume2, Check, RotateCcw, X, Lightbulb, SkipForward, Trophy, Loader2 } from "lucide-react";
import { tokens } from "../theme.js";
import { LandmarkStage, StagePopover } from "../components/LandmarkStage.jsx";
import { buildPlacementQueue } from "../data/placement.js";
import { buildQueueFromWords } from "../data/exerciseBuilder.js";
import { getQueue as apiGetQueue, getWords as apiGetWords, getHintStatus, useHint as apiUseHint, grantAdHint } from "../api.js";

// Через сколько мс появляются "Подсказка"/"Пропустить" — не сразу, чтобы дать
// сначала попробовать самому.
const HELPERS_DELAY_MS = 4000;

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

// Подсказка + Пропустить — общая полоска, появляется через HELPERS_DELAY_MS,
// прячется как только задание уже проверено.
// hintBudget: { remaining: number|null (null = безлимит), tier } — общий на весь урок,
// не пересоздаётся на каждое упражнение.
function HelpersBar({ visible, checked, onHint, hintUsed, onSkip, hintBudget, onWatchAd }) {
  if (!visible || checked) return null;
  const exhausted = hintBudget && hintBudget.remaining === 0;

  return (
    <div className="px-6 pb-2 flex items-center gap-2 shrink-0 flex-wrap">
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
      ) : (
        <button
          onClick={onWatchAd}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-full font-bold text-[12.5px]"
          style={{ background: tokens.accentGradient, color: "#FBF9F4" }}
        >
          <Lightbulb size={14} /> +1 за рекламу
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
  );
}

function FeedbackBar({ checked, correctText, onNext }) {
  if (!checked) return null;
  const isCorrect = checked === "correct";
  const isSkipped = checked === "skipped";
  const bg = isCorrect ? tokens.correctBg : isSkipped ? tokens.track : tokens.wrongBg;
  const fg = isCorrect ? tokens.correct : isSkipped ? tokens.textSecondary : tokens.wrong;

  return (
    <div className="px-4 pb-4 shrink-0">
      <div className="rounded-2xl px-5 py-4 flex items-center justify-between" style={{ background: bg }}>
        <div className="flex items-center gap-3">
          {isCorrect ? <Check size={22} color={fg} strokeWidth={3} /> : isSkipped ? <SkipForward size={20} color={fg} /> : <RotateCcw size={20} color={fg} />}
          <div>
            <p className="font-extrabold text-[14px]" style={{ color: fg }}>
              {isCorrect ? "Точно!" : isSkipped ? "Пропущено" : "Почти"}
            </p>
            {!isCorrect && correctText && <p className="text-[12px]" style={{ color: tokens.textSecondary }}>Верно: {correctText}</p>}
          </div>
        </div>
        <button onClick={onNext} className="px-4 py-2 rounded-xl font-bold text-[13px]" style={{ background: isCorrect ? tokens.accentGradient : isSkipped ? tokens.textSecondary : tokens.wrong, color: "#FBF9F4" }}>
          Дальше
        </button>
      </div>
    </div>
  );
}

function Assembly({ ex, onDone, hintBudget, onRequestHint, onWatchAd }) {
  const [bank, setBank] = useState(ex.bank);
  const [answer, setAnswer] = useState([]);
  const [checked, setChecked] = useState(null);
  const [hintUsed, setHintUsed] = useState(false);
  const helpersVisible = useHelpersVisible();

  const pickTile = (word, idx) => { if (checked) return; setAnswer([...answer, { word, key: idx }]); setBank(bank.filter((_, i) => i !== idx)); };
  const removeTile = (i) => { if (checked) return; setBank([...bank, answer[i].word]); setAnswer(answer.filter((_, idx) => idx !== i)); };
  const check = () => setChecked(answer.map((a) => a.word).join(" ") === ex.correct.join(" ") ? "correct" : "wrong");
  const skip = () => setChecked("skipped");
  const handleHint = async () => {
    const res = await onRequestHint();
    if (res.allowed) setHintUsed(true);
  };
  // подсказка: подсвечиваем в банке слово, которое должно идти следующим
  const nextCorrectWord = ex.correct[answer.length];

  return (
    <>
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{ex.prompt}</p>
        <div className="flex items-start gap-3 mt-3">
          <button className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: tokens.card }}><Volume2 size={17} color={tokens.accentTeal} /></button>
          <h1 className="text-[22px] font-extrabold leading-snug pt-1.5" style={{ color: tokens.textPrimary }}>{ex.ru}</h1>
        </div>
        <div className="mt-8">
          <div className="min-h-[52px] rounded-2xl flex flex-wrap gap-2 items-center px-3 py-2.5" style={{ background: tokens.card, border: `2px dashed ${tokens.track}` }}>
            {answer.length === 0 && <span className="text-[13px] px-2" style={{ color: tokens.textSecondary }}>Нажимай на слова снизу</span>}
            {answer.map((a, i) => (
              <button key={a.key} onClick={() => removeTile(i)} className="px-3.5 py-2 rounded-xl font-bold text-[14px]" style={{ background: checked === "wrong" ? tokens.wrongBg : tokens.cardActive, color: checked === "wrong" ? tokens.wrong : tokens.textPrimary, border: `1px solid ${checked === "wrong" ? tokens.wrong + "55" : tokens.accentTeal + "40"}` }}>{a.word}</button>
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
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={hintUsed} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} />
      {!checked && (
        <div className="px-4 pb-4 shrink-0">
          <button onClick={check} disabled={answer.length === 0} className="w-full rounded-2xl py-4 font-extrabold text-[15px] tracking-wide" style={{ background: answer.length === 0 ? tokens.track : tokens.accentGradient, color: answer.length === 0 ? tokens.textSecondary : "#FBF9F4" }}>ПРОВЕРИТЬ</button>
        </div>
      )}
      <FeedbackBar checked={checked} correctText={ex.correct.join(" ")} onNext={() => onDone(checked === "correct")} />
    </>
  );
}

function Choice({ ex, onDone, hintBudget, onRequestHint, onWatchAd }) {
  const [picked, setPicked] = useState(null);
  const [checked, setChecked] = useState(null);
  const [hintUsed, setHintUsed] = useState(false);
  const helpersVisible = useHelpersVisible();

  const check = (opt, i) => { if (checked) return; setPicked(i); setChecked(opt.correct ? "correct" : "wrong"); };
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
          <button className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: tokens.card }}><Volume2 size={17} color={tokens.accentTeal} /></button>
          <h1 className="text-[22px] font-extrabold leading-snug pt-1.5" style={{ color: tokens.textPrimary }}>{ex.source}</h1>
        </div>
        <div className="flex flex-col gap-2.5 mt-8">
          {ex.options.map((opt, i) => {
            const isPicked = picked === i;
            const isHinted = hintUsed && !checked && opt.correct;
            let bg = tokens.card, border = "1px solid transparent", color = tokens.textPrimary;
            if (checked && isPicked) { bg = opt.correct ? tokens.correctBg : tokens.wrongBg; border = `1px solid ${opt.correct ? tokens.correct : tokens.wrong}55`; color = opt.correct ? tokens.correct : tokens.wrong; }
            else if (isHinted) { bg = tokens.correctBg; border = `1px solid ${tokens.correct}55`; color = tokens.correct; }
            return <button key={i} onClick={() => check(opt, i)} className="text-left px-4 py-3.5 rounded-2xl font-semibold text-[14.5px]" style={{ background: bg, border, color }}>{opt.text}</button>;
          })}
        </div>
      </div>
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={hintUsed} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} />
      <FeedbackBar checked={checked} correctText={ex.options.find((o) => o.correct).text} onNext={() => onDone(checked === "correct")} />
    </>
  );
}

function FillBlank({ ex, onDone, hintBudget, onRequestHint, onWatchAd }) {
  const [picked, setPicked] = useState(null);
  const [checked, setChecked] = useState(null);
  const [hintUsed, setHintUsed] = useState(false);
  const helpersVisible = useHelpersVisible();

  const check = (word) => { if (checked) return; setPicked(word); setChecked(word === ex.correct ? "correct" : "wrong"); };
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
          <span className="min-w-[90px] text-center px-3 py-1.5 rounded-xl text-[16px] font-extrabold" style={{ background: checked ? (checked === "correct" ? tokens.correctBg : tokens.wrongBg) : tokens.card, color: checked ? (checked === "correct" ? tokens.correct : tokens.wrong) : tokens.textSecondary, border: `2px dashed ${tokens.track}` }}>{picked || "..."}</span>
          <span className="text-[20px] font-extrabold" style={{ color: tokens.textPrimary }}>{ex.after}</span>
        </div>
        <div className="flex flex-wrap gap-2.5 justify-center mt-10">
          {ex.options.map((word) => {
            const isHinted = hintUsed && !checked && word === ex.correct;
            return (
              <button key={word} onClick={() => check(word)} className="px-4 py-2.5 rounded-xl font-bold text-[14px]" style={{ background: isHinted ? tokens.correctBg : tokens.card, color: isHinted ? tokens.correct : tokens.textPrimary, border: `1px solid ${isHinted ? tokens.correct + "70" : tokens.track}` }}>{word}</button>
            );
          })}
        </div>
      </div>
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={hintUsed} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} />
      <FeedbackBar checked={checked} correctText={ex.correct} onNext={() => onDone(checked === "correct")} />
    </>
  );
}

function TranslateToUz({ ex, onDone, hintBudget, onRequestHint, onWatchAd }) {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(null);
  const [revealedCount, setRevealedCount] = useState(0);
  const helpersVisible = useHelpersVisible();

  const check = () => setChecked(ex.accept.includes(value.trim().toLowerCase().replace(/\s+/g, " ")) ? "correct" : "wrong");
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
          <button className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: tokens.card }}><Volume2 size={17} color={tokens.accentTeal} /></button>
          <h1 className="text-[22px] font-extrabold leading-snug pt-1.5" style={{ color: tokens.textPrimary }}>{ex.source}</h1>
        </div>
        <input value={value} onChange={(e) => !checked && setValue(e.target.value)} placeholder="Напиши перевод на узбекском..." className="w-full mt-8 rounded-2xl px-4 py-3.5 text-[15px] font-semibold outline-none" style={{ background: tokens.card, color: tokens.textPrimary, border: `2px solid ${checked === "wrong" ? tokens.wrong : "transparent"}` }} />

        {revealedCount > 0 && (
          <div className="flex items-center gap-1.5 mt-3 px-1">
            {ex.word.split("").map((letter, i) => (
              <span
                key={i}
                className="w-7 h-8 rounded-lg flex items-center justify-center font-extrabold text-[14px]"
                style={{ background: i < revealedCount ? tokens.correctBg : tokens.card, color: i < revealedCount ? tokens.correct : tokens.textSecondary, border: `1px solid ${tokens.track}` }}
              >
                {i < revealedCount ? letter : "·"}
              </span>
            ))}
          </div>
        )}
      </div>
      <HelpersBar visible={helpersVisible} checked={checked} onHint={handleHint} hintUsed={revealedCount >= ex.word.length} onSkip={skip} hintBudget={hintBudget} onWatchAd={onWatchAd} />
      {!checked && (
        <div className="px-4 pb-4 shrink-0">
          <button onClick={check} disabled={!value.trim()} className="w-full rounded-2xl py-4 font-extrabold text-[15px] tracking-wide" style={{ background: !value.trim() ? tokens.track : tokens.accentGradient, color: !value.trim() ? tokens.textSecondary : "#FBF9F4" }}>ПРОВЕРИТЬ</button>
        </div>
      )}
      <FeedbackBar checked={checked} correctText={ex.accept[0]} onNext={() => onDone(checked === "correct")} />
    </>
  );
}

const RENDERERS = { assembly: Assembly, choice: Choice, fillBlank: FillBlank, translateToUz: TranslateToUz };

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

function LoadingState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3">
      <Loader2 size={28} color={tokens.accentTeal} className="animate-spin" />
      <p className="text-[13px]" style={{ color: tokens.textSecondary }}>Загружаем задания…</p>
    </div>
  );
}

function EmptyState({ onExit }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center">
      <p className="font-bold text-[15px]" style={{ color: tokens.textPrimary }}>Пока нечего повторять</p>
      <p className="text-[13px]" style={{ color: tokens.textSecondary }}>В этой подборке не нашлось слов с примерами для упражнений</p>
      <button onClick={onExit} className="mt-2 rounded-full px-6 py-2.5 font-bold text-[13px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
        Назад
      </button>
    </div>
  );
}

export default function TrainerScreen({ onExit, topicFilter, placementLevel, onFinishPlacement }) {
  const [index, setIndex] = useState(0);
  const [showBadge, setShowBadge] = useState(false);
  const [score, setScore] = useState(0);
  const [queue, setQueue] = useState(null); // null = ещё грузится
  const [hintBudget, setHintBudget] = useState(null); // {remaining, tier} — общий на весь урок
  const isPlacement = Boolean(placementLevel);

  useEffect(() => {
    let cancelled = false;
    setQueue(null);
    setIndex(0);
    setScore(0);

    async function load() {
      let built;
      if (isPlacement) {
        built = await buildPlacementQueue(placementLevel);
      } else if (topicFilter) {
        const { words } = await apiGetWords({ level: topicFilter.level, topic: topicFilter.name });
        built = buildQueueFromWords(words || []);
      } else {
        const { queue: apiQueue } = await apiGetQueue(20);
        built = buildQueueFromWords(apiQueue || []);
      }
      if (!cancelled) setQueue(built);

      // На placement-тесте подсказки не лимитируем (это разовая проверка, не основная практика).
      if (!isPlacement && !cancelled) {
        const status = await getHintStatus();
        if (!cancelled) setHintBudget({ remaining: status.remaining, tier: status.tier });
      }
    }
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlacement, placementLevel, topicFilter?.id, topicFilter?.subLesson?.index]);

  const requestHint = async () => {
    if (isPlacement) return { allowed: true }; // без лимита на тесте
    const res = await apiUseHint();
    setHintBudget({ remaining: res.remaining, tier: hintBudget?.tier });
    return res;
  };

  const watchAd = async () => {
    // TODO: тут вызов реального рекламного SDK (Adsgram и т.п.), см. инструкцию в чате —
    // grantAdHint() должен вызываться только из callback за просмотр рекламы ДО КОНЦА.
    await grantAdHint();
    const status = await getHintStatus();
    setHintBudget({ remaining: status.remaining, tier: status.tier });
  };

  if (queue === null) return <LoadingState />;
  if (queue.length === 0) return <EmptyState onExit={onExit} />;

  const finished = isPlacement && index >= queue.length;
  if (finished) {
    return <PlacementResult score={score} total={queue.length} level={placementLevel} onFinish={() => onFinishPlacement(placementLevel)} />;
  }

  const ex = isPlacement ? queue[index] : queue[index % queue.length];
  const Renderer = RENDERERS[ex.type];
  const progress = isPlacement ? index / queue.length : (index % queue.length) / queue.length;

  const handleDone = (wasCorrect) => {
    if (isPlacement && wasCorrect) setScore((s) => s + 1);
    // TODO: submitAnswer(ex.wordId, wasCorrect) — не для placement (там не должно
    // трогать реальный прогресс слов, это только проверка стартового уровня)
    setIndex((i) => i + 1);
  };

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {showBadge && <StagePopover stage={ex.wordStage} decay={0} onClose={() => setShowBadge(false)} />}
      <TopBar progress={progress} stage={ex.wordStage} onBadgeClick={() => setShowBadge(true)} onExit={onExit} />
      {isPlacement && (
        <div className="px-5 pb-2 shrink-0">
          <div className="rounded-xl px-3.5 py-2 text-[12.5px] font-semibold" style={{ background: tokens.cardActive, color: tokens.accentTeal }}>
            Проверка уровня {placementLevel} · вопрос {index + 1} из {queue.length}
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
      <Renderer key={index} ex={ex} onDone={handleDone} hintBudget={hintBudget} onRequestHint={requestHint} onWatchAd={watchAd} />
    </div>
  );
}
