import React, { useState } from "react";
import { Heart, Volume2, Check, RotateCcw, X } from "lucide-react";
import { tokens } from "../theme.js";
import { LandmarkStage, StagePopover } from "../components/LandmarkStage.jsx";

// TODO: заменить на очередь упражнений от SRS-алгоритма (Apps Script API).
// type: "assembly" | "translateToUz" | "choice" | "fillBlank"
const QUEUE = [
  {
    type: "assembly",
    wordStage: 3,
    prompt: "Собери предложение",
    ru: "Я каждый день хожу в школу.",
    correct: ["Men", "har", "kuni", "maktabga", "boraman."],
    bank: ["Men", "maktabga", "kuni", "boraman.", "kelaman.", "har", "maktabdan"],
  },
  {
    type: "choice",
    wordStage: 4,
    prompt: "Выбери перевод",
    source: "U bozorga ketdi.",
    options: [
      { text: "Она пошла на рынок.", correct: true },
      { text: "Он купил еду.", correct: false },
      { text: "Мы идём домой.", correct: false },
      { text: "Ты был на рынке?", correct: false },
    ],
  },
  {
    type: "fillBlank",
    wordStage: 1,
    prompt: "Вставь пропущенное слово",
    before: "Bozorda",
    after: "sotib oldim.",
    ru: "Я купил на рынке мясо.",
    options: ["go‘sht", "tovuq", "kitob", "suv"],
    correct: "go‘sht",
  },
  {
    type: "translateToUz",
    wordStage: 2,
    prompt: "Переведи на узбекский",
    source: "Ты откуда приехал?",
    accept: ["sen qayerdan kelding?", "sen qayerdan kelding"],
    hint: "sen · qayerdan · kelding?",
  },
];

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

function FeedbackBar({ checked, correctText, onNext }) {
  if (!checked) return null;
  return (
    <div className="px-4 pb-4 shrink-0">
      <div className="rounded-2xl px-5 py-4 flex items-center justify-between" style={{ background: checked === "correct" ? tokens.correctBg : tokens.wrongBg }}>
        <div className="flex items-center gap-3">
          {checked === "correct" ? <Check size={22} color={tokens.correct} strokeWidth={3} /> : <RotateCcw size={20} color={tokens.wrong} />}
          <div>
            <p className="font-extrabold text-[14px]" style={{ color: checked === "correct" ? tokens.correct : tokens.wrong }}>
              {checked === "correct" ? "Точно!" : "Почти"}
            </p>
            {checked === "wrong" && correctText && <p className="text-[12px]" style={{ color: tokens.textSecondary }}>Верно: {correctText}</p>}
          </div>
        </div>
        <button onClick={onNext} className="px-4 py-2 rounded-xl font-bold text-[13px]" style={{ background: checked === "correct" ? tokens.accentGradient : tokens.wrong, color: "#FBF9F4" }}>
          Дальше
        </button>
      </div>
    </div>
  );
}

function Assembly({ ex, onDone }) {
  const [bank, setBank] = useState(ex.bank);
  const [answer, setAnswer] = useState([]);
  const [checked, setChecked] = useState(null);

  const pickTile = (word, idx) => { if (checked) return; setAnswer([...answer, { word, key: idx }]); setBank(bank.filter((_, i) => i !== idx)); };
  const removeTile = (i) => { if (checked) return; setBank([...bank, answer[i].word]); setAnswer(answer.filter((_, idx) => idx !== i)); };
  const check = () => setChecked(answer.map((a) => a.word).join(" ") === ex.correct.join(" ") ? "correct" : "wrong");

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
          {bank.map((word, i) => (
            <button key={word + i} onClick={() => pickTile(word, i)} className="px-4 py-2.5 rounded-xl font-bold text-[14px]" style={{ background: tokens.card, color: tokens.textPrimary, border: `1px solid ${tokens.track}` }}>{word}</button>
          ))}
        </div>
      </div>
      {!checked && (
        <div className="px-4 pb-4 shrink-0">
          <button onClick={check} disabled={answer.length === 0} className="w-full rounded-2xl py-4 font-extrabold text-[15px] tracking-wide" style={{ background: answer.length === 0 ? tokens.track : tokens.accentGradient, color: answer.length === 0 ? tokens.textSecondary : "#FBF9F4" }}>ПРОВЕРИТЬ</button>
        </div>
      )}
      <FeedbackBar checked={checked} correctText={ex.correct.join(" ")} onNext={onDone} />
    </>
  );
}

function Choice({ ex, onDone }) {
  const [picked, setPicked] = useState(null);
  const [checked, setChecked] = useState(null);
  const check = (opt, i) => { if (checked) return; setPicked(i); setChecked(opt.correct ? "correct" : "wrong"); };

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
            let bg = tokens.card, border = "1px solid transparent", color = tokens.textPrimary;
            if (checked && isPicked) { bg = opt.correct ? tokens.correctBg : tokens.wrongBg; border = `1px solid ${opt.correct ? tokens.correct : tokens.wrong}55`; color = opt.correct ? tokens.correct : tokens.wrong; }
            return <button key={i} onClick={() => check(opt, i)} className="text-left px-4 py-3.5 rounded-2xl font-semibold text-[14.5px]" style={{ background: bg, border, color }}>{opt.text}</button>;
          })}
        </div>
      </div>
      <FeedbackBar checked={checked} correctText={ex.options.find((o) => o.correct).text} onNext={onDone} />
    </>
  );
}

function FillBlank({ ex, onDone }) {
  const [picked, setPicked] = useState(null);
  const [checked, setChecked] = useState(null);
  const check = (word) => { if (checked) return; setPicked(word); setChecked(word === ex.correct ? "correct" : "wrong"); };

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
          {ex.options.map((word) => (
            <button key={word} onClick={() => check(word)} className="px-4 py-2.5 rounded-xl font-bold text-[14px]" style={{ background: tokens.card, color: tokens.textPrimary, border: `1px solid ${tokens.track}` }}>{word}</button>
          ))}
        </div>
      </div>
      <FeedbackBar checked={checked} correctText={ex.correct} onNext={onDone} />
    </>
  );
}

function TranslateToUz({ ex, onDone }) {
  const [value, setValue] = useState("");
  const [checked, setChecked] = useState(null);
  const check = () => setChecked(ex.accept.includes(value.trim().toLowerCase().replace(/\s+/g, " ")) ? "correct" : "wrong");

  return (
    <>
      <div className="px-6 pt-4 flex-1 overflow-y-auto">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{ex.prompt}</p>
        <div className="flex items-start gap-3 mt-3">
          <button className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: tokens.card }}><Volume2 size={17} color={tokens.accentTeal} /></button>
          <h1 className="text-[22px] font-extrabold leading-snug pt-1.5" style={{ color: tokens.textPrimary }}>{ex.source}</h1>
        </div>
        <input value={value} onChange={(e) => !checked && setValue(e.target.value)} placeholder="Напиши перевод на узбекском..." className="w-full mt-8 rounded-2xl px-4 py-3.5 text-[15px] font-semibold outline-none" style={{ background: tokens.card, color: tokens.textPrimary, border: `2px solid ${checked === "wrong" ? tokens.wrong : "transparent"}` }} />
        <p className="text-[12px] mt-2 px-1" style={{ color: tokens.textSecondary }}>Подсказка: {ex.hint}</p>
      </div>
      {!checked && (
        <div className="px-4 pb-4 shrink-0">
          <button onClick={check} disabled={!value.trim()} className="w-full rounded-2xl py-4 font-extrabold text-[15px] tracking-wide" style={{ background: !value.trim() ? tokens.track : tokens.accentGradient, color: !value.trim() ? tokens.textSecondary : "#FBF9F4" }}>ПРОВЕРИТЬ</button>
        </div>
      )}
      <FeedbackBar checked={checked} correctText={ex.accept[0]} onNext={onDone} />
    </>
  );
}

const RENDERERS = { assembly: Assembly, choice: Choice, fillBlank: FillBlank, translateToUz: TranslateToUz };

export default function TrainerScreen({ onExit }) {
  const [index, setIndex] = useState(0);
  const [showBadge, setShowBadge] = useState(false);
  const ex = QUEUE[index % QUEUE.length];
  const Renderer = RENDERERS[ex.type];
  const progress = (index % QUEUE.length) / QUEUE.length;

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {showBadge && <StagePopover stage={ex.wordStage} decay={0} onClose={() => setShowBadge(false)} />}
      <TopBar progress={progress} stage={ex.wordStage} onBadgeClick={() => setShowBadge(true)} onExit={onExit} />
      <Renderer key={index} ex={ex} onDone={() => setIndex((i) => i + 1)} />
    </div>
  );
}
