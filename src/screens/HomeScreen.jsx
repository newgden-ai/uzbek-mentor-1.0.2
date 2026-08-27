import React, { useState } from "react";
import { ChevronRight, Flame } from "lucide-react";
import { tokens, levelColor } from "../theme.js";

const skills = [
  { label: "Listening", value: 3, max: 5 },
  { label: "Vocabulary", value: 3, max: 5 },
  { label: "Grammar", value: 2, max: 5 },
  { label: "Speaking", value: 2, max: 5 },
  { label: "Reading", value: 1, max: 5 },
];

const checks = [
  { id: "srs", title: "Повторения сегодня", subtitle: "SRS · 14 слов ждут повтора" },
  { id: "new", title: "Новые слова", subtitle: "дневная цель · 10 слов" },
  { id: "topic", title: "Тест по теме «Местоимения»", subtitle: "12 вопросов · закрепление" },
];

const LEVEL_OPTIONS = [
  { level: "A1", label: "Начинающий", desc: "Знаю пару слов или совсем ничего" },
  { level: "A2", label: "Элементарный", desc: "Понимаю простые фразы" },
  { level: "B1", label: "Средний", desc: "Могу поддержать разговор" },
  { level: "B2", label: "Выше среднего", desc: "Свободно общаюсь на бытовые темы" },
];

// Показывается, пока пользователь ни разу не выбрал уровень (1.3).
// После выбора запускается placement-тест — см. App.jsx (onSelectLevel → placementLevel).
function LevelPicker({ onSelectLevel }) {
  return (
    <div className="px-6 pt-10 flex-1 flex flex-col">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Перед началом</p>
      <h1 className="text-2xl font-extrabold mt-1 leading-snug" style={{ color: tokens.textPrimary }}>
        Как оцениваешь свой уровень узбекского?
      </h1>
      <p className="text-[13px] mt-2" style={{ color: tokens.textSecondary }}>
        После выбора — короткая проверка (до 30 заданий), чтобы точно подобрать сложность
      </p>

      <div className="flex flex-col gap-2.5 mt-6">
        {LEVEL_OPTIONS.map((opt) => (
          <button
            key={opt.level}
            onClick={() => onSelectLevel(opt.level)}
            className="w-full text-left rounded-2xl px-5 py-4 flex items-center justify-between"
            style={{ background: tokens.card }}
          >
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold rounded-full px-2 py-0.5" style={{ background: `${levelColor[opt.level]}22`, color: levelColor[opt.level] }}>
                  {opt.level}
                </span>
                <p className="font-bold text-[15px]" style={{ color: tokens.textPrimary }}>{opt.label}</p>
              </div>
              <p className="text-[12.5px] mt-1" style={{ color: tokens.textSecondary }}>{opt.desc}</p>
            </div>
            <ChevronRight size={18} color={tokens.textSecondary} />
          </button>
        ))}
      </div>
    </div>
  );
}

export default function HomeScreen({ user, userLevel, onSelectLevel }) {
  const [active, setActive] = useState("srs");
  const activeCheck = checks.find((c) => c.id === active);
  const displayName = user?.first_name || user?.username || "друг";
  const streak = user?.streak ?? 0;

  if (!userLevel) return <LevelPicker onSelectLevel={onSelectLevel} />;

  return (
    <div className="px-6 pt-6 pb-2 flex-1 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>
          Assalomu alaykum, {displayName}
        </p>
        <div className="flex items-center gap-1 rounded-full px-3 py-1" style={{ background: tokens.card }}>
          <Flame size={14} color={tokens.accentOchre} />
          <span className="text-xs font-bold" style={{ color: tokens.textPrimary }}>{streak}</span>
        </div>
      </div>
      <div className="flex items-center justify-between mt-1">
        <h1 className="text-3xl font-extrabold" style={{ color: tokens.textPrimary }}>
          Сегодня: {userLevel}
        </h1>
        <button onClick={() => onSelectLevel(null)} className="text-[11px] font-semibold underline" style={{ color: tokens.textSecondary }}>
          изменить
        </button>
      </div>

      <p className="text-[11px] font-bold tracking-widest uppercase mt-5" style={{ color: tokens.textSecondary }}>
        Spaced Repetition
      </p>
      <h2 className="text-xl font-bold mt-1 leading-snug" style={{ color: tokens.textPrimary }}>
        Слово забывается, если не повторить вовремя
      </h2>

      <div className="flex flex-col gap-3 mt-4">
        {checks.map((c) => {
          const isActive = c.id === active;
          return (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className="w-full text-left rounded-2xl px-5 py-4 flex items-center justify-between"
              style={{
                background: isActive ? tokens.cardActive : tokens.card,
                border: isActive ? `1px solid ${tokens.accentTeal}55` : "1px solid transparent",
              }}
            >
              <div>
                <p className="font-bold text-[15px]" style={{ color: tokens.textPrimary }}>{c.title}</p>
                <p className="text-xs mt-0.5" style={{ color: tokens.textSecondary }}>{c.subtitle}</p>
              </div>
              <ChevronRight size={18} color={tokens.textSecondary} />
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl px-5 py-5 mt-4" style={{ background: tokens.card }}>
        <p className="font-bold text-[17px]" style={{ color: tokens.textPrimary }}>{activeCheck.title}</p>
        <p className="text-[13px] mt-1 leading-relaxed" style={{ color: tokens.textSecondary }}>
          Сложность подстраивается под твой уровень после каждого блока ответов.
        </p>

        <div className="flex flex-col gap-2.5 mt-5">
          {skills.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className="text-[13px] font-semibold w-20 shrink-0" style={{ color: tokens.textPrimary }}>{s.label}</span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: tokens.track }}>
                <div className="h-full rounded-full" style={{ width: `${(s.value / s.max) * 100}%`, background: tokens.accentGradient }} />
              </div>
              <span className="text-[13px] font-bold w-4 text-right" style={{ color: tokens.textPrimary }}>{s.value}</span>
            </div>
          ))}
        </div>

        <button className="w-full mt-6 rounded-full py-3.5 font-bold text-[15px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
          Запустить тренировку
        </button>
      </div>
    </div>
  );
}
