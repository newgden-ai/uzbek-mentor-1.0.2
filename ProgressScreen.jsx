import React, { useState } from "react";
import { Flame, Trophy, Zap, Lock, Target, Ghost, Gem } from "lucide-react";
import { tokens } from "../theme.js";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const weekDone = [true, true, true, true, true, false, false];

const CATEGORIES = [
  { id: "tasks", label: "Задания" },
  { id: "streak", label: "Серии" },
  { id: "words", label: "Слова" },
  { id: "humor", label: "Юмор" },
  { id: "rare", label: "Редкие" },
];

// превью системы достижений — полный набор ~1000 делаем отдельным заходом,
// логика названий уже зафиксирована по категориям
const achievements = [
  { icon: Zap, title: "Разогрев", desc: "10 заданий выполнено", unlocked: true, cat: "tasks" },
  { icon: Zap, title: "Полумарафон", desc: "21 задание выполнено", unlocked: true, cat: "tasks" },
  { icon: Trophy, title: "Марафонец", desc: "42 задания выполнено", unlocked: false, cat: "tasks" },
  { icon: Trophy, title: "Центурион", desc: "100 заданий выполнено", unlocked: false, cat: "tasks" },
  { icon: Flame, title: "Старт есть", desc: "3 дня подряд", unlocked: true, cat: "streak" },
  { icon: Flame, title: "Неделя без слива", desc: "7 дней подряд", unlocked: true, cat: "streak" },
  { icon: Flame, title: "Железная привычка", desc: "30 дней подряд", unlocked: false, cat: "streak" },
  { icon: Flame, title: "Машина дисциплины", desc: "100 дней подряд", unlocked: false, cat: "streak" },
  { icon: Target, title: "Первые шаги", desc: "100 слов выучено", unlocked: true, cat: "words" },
  { icon: Target, title: "Словарный рывок", desc: "500 слов выучено", unlocked: false, cat: "words" },
  { icon: Target, title: "Ты уже говоришь", desc: "1 000 слов выучено", unlocked: false, cat: "words" },
  { icon: Target, title: "Живой язык", desc: "3 000 слов выучено", unlocked: false, cat: "words" },
  { icon: Ghost, title: "Ночной самурай", desc: "занимался в 3 часа ночи", unlocked: true, cat: "humor" },
  { icon: Ghost, title: "Ну почти 😅", desc: "10 ошибок подряд", unlocked: false, cat: "humor" },
  { icon: Ghost, title: "Зато честно", desc: "50 ошибок за всё время", unlocked: false, cat: "humor" },
  { icon: Gem, title: "Первый день", desc: "первая тренировка в приложении", unlocked: true, cat: "rare" },
  { icon: Gem, title: "Полиглот", desc: "начал изучать второй язык", unlocked: false, cat: "rare" },
];

export default function ProgressScreen() {
  const [xp] = useState(1240);
  const [category, setCategory] = useState("tasks");
  const xpToNext = 1500;

  const shown = achievements.filter((a) => a.cat === category);
  const unlockedInCat = shown.filter((a) => a.unlocked).length;
  const totalUnlocked = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="px-6 pt-6 pb-2 flex-1 flex flex-col overflow-hidden">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Denis · уровень A1.2</p>
      <h1 className="text-3xl font-extrabold mt-1" style={{ color: tokens.textPrimary }}>Прогресс</h1>

      <div className="rounded-2xl px-4 py-3.5 mt-4" style={{ background: tokens.card }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold" style={{ color: tokens.textPrimary }}>{xp} XP</span>
          <span className="text-[12px]" style={{ color: tokens.textSecondary }}>до A1.3 — {xpToNext - xp} XP</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: tokens.track }}>
          <div className="h-full rounded-full" style={{ width: `${(xp / xpToNext) * 100}%`, background: tokens.accentGradient }} />
        </div>
      </div>

      <div className="rounded-2xl px-5 py-4 mt-3" style={{ background: tokens.card }}>
        <div className="flex items-center gap-2">
          <Flame size={20} color={tokens.accentOchre} fill={tokens.accentOchre} />
          <span className="font-extrabold text-[18px]" style={{ color: tokens.textPrimary }}>7 дней подряд</span>
        </div>
        <div className="flex justify-between mt-3.5">
          {weekDays.map((d, i) => (
            <div key={d} className="flex flex-col items-center gap-1.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: weekDone[i] ? tokens.accentGradient : tokens.track }}>
                {weekDone[i] && <Flame size={13} color="#FBF9F4" fill="#FBF9F4" />}
              </div>
              <span className="text-[10px] font-semibold" style={{ color: tokens.textSecondary }}>{d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mt-3">
        {[{ label: "Слов выучено", value: "312" }, { label: "Заданий", value: "1 084" }, { label: "Точность", value: "87%" }].map((s) => (
          <div key={s.label} className="rounded-2xl px-3 py-3 text-center" style={{ background: tokens.card }}>
            <p className="font-extrabold text-[17px]" style={{ color: tokens.textPrimary }}>{s.value}</p>
            <p className="text-[10.5px] mt-0.5 leading-tight" style={{ color: tokens.textSecondary }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex-1 pb-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Достижения</p>
          <span className="text-[12px] font-bold" style={{ color: tokens.accentTeal }}>{totalUnlocked} / 128 →</span>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {CATEGORIES.map((c) => {
            const isActive = c.id === category;
            return (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-[12.5px] font-bold"
                style={{ background: isActive ? tokens.accentGradient : tokens.card, color: isActive ? "#FBF9F4" : tokens.textSecondary }}
              >{c.label}</button>
            );
          })}
        </div>

        <p className="text-[12px] mt-3 mb-2" style={{ color: tokens.textSecondary }}>{unlockedInCat} / {shown.length} открыто в этой категории</p>

        <div className="grid grid-cols-2 gap-2.5">
          {shown.map((a, i) => {
            const Icon = a.icon;
            return (
              <div key={i} className="rounded-2xl px-3.5 py-3.5 flex flex-col gap-2" style={{ background: tokens.card, opacity: a.unlocked ? 1 : 0.55 }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: a.unlocked ? tokens.accentGradient : tokens.track }}>
                  {a.unlocked ? <Icon size={16} color="#FBF9F4" /> : <Lock size={14} color={tokens.textSecondary} />}
                </div>
                <div>
                  <p className="font-bold text-[12.5px] leading-tight" style={{ color: tokens.textPrimary }}>{a.title}</p>
                  <p className="text-[11px] mt-0.5 leading-tight" style={{ color: tokens.textSecondary }}>{a.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
