import React, { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Loader2, Check, X as XIcon, Landmark, Scale } from "lucide-react";
import { tokens } from "../theme.js";
import { getSpecialTrack, getSpecialTrackQueue } from "../api.js";

// 8 — «История Узбекистана» и «Законодательство РУз»: отдельные от языкового
// уровня спецкурсы. Контент (сами вопросы) должен наполнить человек в листах
// history_content / law_content — этот экран НИЧЕГО не выдумывает сам, если
// лист пуст, честно показывает "материалы скоро появятся".
const TRACK_META = {
  history: { title: "История Узбекистана", icon: Landmark },
  law: { title: "Законодательство РУз", icon: Scale },
};

function Quiz({ items, onExit }) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);

  if (index >= items.length) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <h1 className="text-2xl font-extrabold" style={{ color: tokens.textPrimary }}>Готово</h1>
        <p className="text-[14px] mt-2" style={{ color: tokens.textSecondary }}>{score} из {items.length} верно</p>
        <button onClick={onExit} className="mt-6 rounded-full px-8 py-3.5 font-bold text-[15px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
          Назад
        </button>
      </div>
    );
  }

  const item = items[index];
  const next = () => { setPicked(null); setIndex((i) => i + 1); };
  const pick = (opt) => {
    if (picked) return;
    setPicked(opt);
    if (opt.correct) setScore((s) => s + 1);
  };

  return (
    <div className="flex-1 flex flex-col px-6 pt-4">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{item.prompt} · {index + 1}/{items.length}</p>
      <h1 className="text-[19px] font-extrabold mt-3 leading-snug" style={{ color: tokens.textPrimary }}>{item.source}</h1>
      <div className="flex flex-col gap-2.5 mt-6">
        {item.options.map((opt, i) => {
          const isPicked = picked === opt;
          const showCorrect = picked && opt.correct;
          let bg = tokens.card, color = tokens.textPrimary;
          if (showCorrect) { bg = tokens.correctBg; color = tokens.correct; }
          else if (isPicked) { bg = tokens.wrongBg; color = tokens.wrong; }
          return (
            <button key={i} onClick={() => pick(opt)} disabled={Boolean(picked)} className="text-left px-4 py-3.5 rounded-2xl font-semibold text-[14.5px]" style={{ background: bg, color }}>
              {opt.text}
            </button>
          );
        })}
      </div>
      {picked && (
        <button onClick={next} className="mt-auto mb-6 w-full rounded-2xl py-4 font-extrabold text-[15px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
          Дальше
        </button>
      )}
    </div>
  );
}

export default function SpecialTrackScreen({ track, onExit }) {
  const meta = TRACK_META[track] || TRACK_META.history;
  const Icon = meta.icon;
  const [subLevels, setSubLevels] = useState(null);
  const [loadError, setLoadError] = useState(null); // 5 — настоящая ошибка конфигурации, а не "пока пусто"
  const [activeQuiz, setActiveQuiz] = useState(null); // null | items[]

  useEffect(() => {
    setSubLevels(null);
    setLoadError(null);
    getSpecialTrack(track).then((res) => {
      if (res.error) { setLoadError(res.error); setSubLevels([]); return; }
      setSubLevels(res.subLevels || []);
    });
  }, [track]);

  const openSubLevel = async (sub) => {
    const res = await getSpecialTrackQueue(track, sub.subLevel);
    setActiveQuiz(res.queue || []);
  };

  if (activeQuiz) {
    return <Quiz items={activeQuiz} onExit={() => setActiveQuiz(null)} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 pt-6 pb-3 flex items-center gap-3 shrink-0">
        <button onClick={onExit} aria-label="Назад"><ChevronLeft size={22} color={tokens.textSecondary} /></button>
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: tokens.cardActive }}>
          <Icon size={17} color={tokens.accentTeal} />
        </div>
        <h1 className="text-xl font-extrabold" style={{ color: tokens.textPrimary }}>{meta.title}</h1>
      </div>

      <div className="px-6 flex-1 overflow-y-auto pb-6">
        {subLevels === null && (
          <div className="flex flex-col items-center gap-2 mt-10">
            <Loader2 size={22} color={tokens.accentTeal} className="animate-spin" />
          </div>
        )}
        {subLevels !== null && subLevels.length === 0 && (
          <div className="flex flex-col items-center gap-2 mt-10 px-4 text-center">
            <p className="font-bold text-[15px]" style={{ color: tokens.textPrimary }}>
              {loadError ? "Не удалось загрузить материалы" : "Материалы скоро появятся"}
            </p>
            <p className="text-[13px]" style={{ color: tokens.textSecondary }}>
              {loadError || `Этот раздел изучается отдельно от языкового уровня. Контент по «${meta.title.toLowerCase()}» ещё не добавлен в базу.`}
            </p>
          </div>
        )}
        {subLevels !== null && subLevels.length > 0 && (
          <div className="flex flex-col gap-2.5 mt-2">
            {subLevels.map((s) => (
              <button
                key={s.subLevel}
                onClick={() => openSubLevel(s)}
                className="w-full text-left rounded-2xl px-5 py-4 flex items-center justify-between"
                style={{ background: tokens.card }}
              >
                <div>
                  <p className="font-bold text-[15px]" style={{ color: tokens.textPrimary }}>{s.label}</p>
                  <p className="text-[12.5px] mt-1" style={{ color: tokens.textSecondary }}>{s.count} вопросов</p>
                </div>
                <ChevronRight size={18} color={tokens.textSecondary} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
