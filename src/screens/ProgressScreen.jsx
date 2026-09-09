import React, { useState, useEffect } from "react";
import { Lock, Ticket, Check } from "lucide-react";
import { TeaBowl } from "../components/TeaBowl.jsx";
import { tokens } from "../theme.js";
import { redeemCode, getStats, getPath } from "../api.js";
import { CATEGORIES, buildAchievements } from "../data/achievements.js";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
// 3 — точная недельная активность приходит с бэкенда (Code.gs: computeWeekActivity,
// на основе листа daily_activity). approximateWeek оставлен как fallback только
// для демо-режима без API (VITE_API_URL не задан) или если бэкенд ещё старый
// и не прислал weekActivity — чтобы экран не падал.
function approximateWeek(streak) {
  return Array.from({ length: 7 }, (_, i) => i >= 7 - Math.min(streak, 7));
}

function PromoCodeCard({ onRedeemed }) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState(null); // null | 'loading' | 'ok' | 'error'
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!code.trim()) return;
    setStatus("loading");
    const res = await redeemCode(code.trim());
    if (res.error) {
      setStatus("error");
      setMessage(res.error);
    } else {
      setStatus("ok");
      setMessage(`Тариф обновлён: ${res.tier}`);
      onRedeemed?.(res.tier);
    }
  };

  return (
    <div className="rounded-2xl px-4 py-3.5 mt-3" style={{ background: tokens.card }}>
      <div className="flex items-center gap-2 mb-2">
        <Ticket size={15} color={tokens.accentOchre} />
        <span className="text-[12.5px] font-bold" style={{ color: tokens.textPrimary }}>Есть промокод?</span>
      </div>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value); setStatus(null); }}
          placeholder="Введи код"
          className="flex-1 rounded-xl px-3 py-2 text-[16px] font-semibold outline-none"
          style={{ background: tokens.cardActive, color: tokens.textPrimary }}
        />
        <button
          onClick={submit}
          disabled={status === "loading"}
          className="px-4 py-2 rounded-xl font-bold text-[12.5px] shrink-0"
          style={{ background: tokens.accentGradient, color: "#FBF9F4" }}
        >
          Активировать
        </button>
      </div>
      {status === "ok" && (
        <p className="text-[12px] mt-2 flex items-center gap-1" style={{ color: tokens.correct }}>
          <Check size={13} /> {message}
        </p>
      )}
      {status === "error" && (
        <p className="text-[12px] mt-2" style={{ color: tokens.wrong }}>{message}</p>
      )}
    </div>
  );
}

export default function ProgressScreen({ user }) {
  const xp = user?.xp ?? 0;
  const [category, setCategory] = useState("tasks");
  const [view, setView] = useState("all"); // 2 — "all" (все достижения) | "mine" (только открытые)
  const xpToNext = Math.ceil((xp + 1) / 500) * 500; // грубая прикидка следующего порога, пока нет реальной формулы уровней
  const displayName = user?.first_name || user?.username || "Ты";
  // 6 — в профиле теперь всегда видно телеграм-логин (@username), а не только
  // имя: раньше displayName показывал first_name ИЛИ username, поэтому логин
  // просто нигде не отображался, если у пользователя было заполнено имя.
  const loginHandle = user?.username ? `@${user.username}` : null;
  const level = user?.level || "—";
  const streak = user?.streak ?? 0;
  const weekActivity = Array.isArray(user?.weekActivity) ? user.weekActivity : approximateWeek(streak);
  const [tier, setTier] = useState(user?.tier || "free");
  const [stats, setStats] = useState(null);
  const [topics, setTopics] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getStats().then((s) => { if (!cancelled && !s.error) setStats(s); });
    getPath().then((p) => { if (!cancelled && !p.error) setTopics(p.topics); });
    return () => { cancelled = true; };
  }, []);

  // 1 — достижения считаются от реальной статистики (см. src/data/achievements.js);
  // пока stats ещё грузится — считаем список пустым, чтобы не мигать неверными
  // unlocked=false для всех и не путать пользователя на долю секунды.
  const achievements = stats ? buildAchievements(stats, topics) : [];
  const inCategory = achievements.filter((a) => a.cat === category);
  const shown = view === "mine" ? inCategory.filter((a) => a.unlocked) : inCategory;
  const unlockedInCat = inCategory.filter((a) => a.unlocked).length;
  const totalUnlocked = achievements.filter((a) => a.unlocked).length;

  return (
    <div className="px-6 pt-6 pb-2 flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>{displayName} · уровень {level}</p>
        <span className="text-[10.5px] font-extrabold uppercase rounded-full px-2.5 py-1" style={{ background: `${tokens.accentOchre}22`, color: tokens.accentOchre }}>
          {tier}
        </span>
      </div>
      {loginHandle && (
        <p className="text-[12px] font-semibold mt-0.5" style={{ color: tokens.textSecondary }}>{loginHandle}</p>
      )}
      <h1 className="text-3xl font-extrabold mt-1" style={{ color: tokens.textPrimary }}>Прогресс</h1>

      <div className="rounded-2xl px-4 py-3.5 mt-4" style={{ background: tokens.card }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-bold" style={{ color: tokens.textPrimary }}>{xp} XP</span>
          <span className="text-[12px]" style={{ color: tokens.textSecondary }}>до следующего уровня — {xpToNext - xp} XP</span>
        </div>
        <div className="h-2.5 rounded-full overflow-hidden" style={{ background: tokens.track }}>
          <div className="h-full rounded-full" style={{ width: `${(xp / xpToNext) * 100}%`, background: tokens.accentGradient }} />
        </div>
      </div>

      <PromoCodeCard onRedeemed={(newTier) => setTier(newTier)} />

      <div className="rounded-2xl px-5 py-4 mt-3" style={{ background: tokens.card }}>
        <div className="flex items-center gap-2">
          <TeaBowl size={22} />
          <span className="font-extrabold text-[18px]" style={{ color: tokens.textPrimary }}>{streak} дней подряд</span>
        </div>
        <div className="flex justify-between mt-3.5">
          {weekDays.map((d, i) => (
            <div key={d} className="flex flex-col items-center gap-1.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: weekActivity[i] ? tokens.accentGradient : tokens.track }}>
                {weekActivity[i] && <TeaBowl size={15} />}
              </div>
              <span className="text-[10px] font-semibold" style={{ color: tokens.textSecondary }}>{d}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mt-3">
        {[
          { label: "Слов освоено", value: stats ? String(stats.wordsMastered) : "—" },
          { label: "Заданий", value: stats ? stats.tasksDone.toLocaleString("ru-RU") : "—" },
          { label: "Точность", value: stats && stats.tasksDone > 0 ? `${Math.round((1 - stats.mistakesTotal / stats.tasksDone) * 100)}%` : "—" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl px-3 py-3 text-center" style={{ background: tokens.card }}>
            <p className="font-extrabold text-[17px]" style={{ color: tokens.textPrimary }}>{s.value}</p>
            <p className="text-[10.5px] mt-0.5 leading-tight" style={{ color: tokens.textSecondary }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex-1 pb-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Достижения</p>
          <span className="text-[12px] font-bold" style={{ color: tokens.accentTeal }}>{totalUnlocked} / {achievements.length} →</span>
        </div>

        <div className="flex gap-1.5 mb-2.5 rounded-full p-1" style={{ background: tokens.track }}>
          {[{ id: "all", label: "Все достижения" }, { id: "mine", label: "Мои достижения" }].map((v) => {
            const isActive = view === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className="flex-1 py-1.5 rounded-full text-[12.5px] font-bold"
                style={{ background: isActive ? tokens.accentGradient : "transparent", color: isActive ? "#FBF9F4" : tokens.textSecondary }}
              >{v.label}</button>
            );
          })}
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

        <p className="text-[12px] mt-3 mb-2" style={{ color: tokens.textSecondary }}>{unlockedInCat} / {inCategory.length} открыто в этой категории</p>

        {shown.length === 0 && view === "mine" && (
          <p className="text-center text-[12.5px] mt-6" style={{ color: tokens.textSecondary }}>
            В этой категории пока нет открытых достижений — загляни в «Все достижения», чтобы увидеть, к чему стремиться
          </p>
        )}

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
