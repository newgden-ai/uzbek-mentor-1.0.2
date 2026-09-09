import React, { useState, useEffect } from "react";
import { Check, Lock, Play, RotateCcw, ChevronRight, Loader2 } from "lucide-react";
import { tokens, levelColor } from "../theme.js";
import { getPath, getTopicProgress } from "../api.js";

const LEVEL_ORDER = ["A1", "A2", "B1", "B2"];
const CHUNK_SIZE = 12; // сколько слов в одной подтеме — держит уроки короткими

// Группирует плоский список тем от API по уровням и расставляет статусы:
// тема "done" только если реально все слова темы освоены (mastered === total,
// т.е. дошли до 5 стадии здания), следующая тема открывается только после этого.
function groupIntoLevels(topics) {
  const byLevel = {};
  topics.forEach((t) => {
    byLevel[t.level] = byLevel[t.level] || [];
    byLevel[t.level].push(t);
  });

  return LEVEL_ORDER.filter((lvl) => byLevel[lvl]).map((level) => {
    let prevDone = true;
    const levelTopics = byLevel[level].map((t) => {
      const isDone = t.total > 0 && t.mastered === t.total;
      const status = isDone ? "done" : prevDone ? "current" : "locked";
      prevDone = isDone;
      return { id: t.name, name: t.name, count: t.total, status };
    });
    const totalWords = byLevel[level].reduce((sum, t) => sum + t.total, 0);
    return { level, subtitle: `${totalWords} слов`, topics: levelTopics };
  });
}

// 7 — реальные подтемы (Часть 1/2/3…) по фактическому прогрессу (points каждого
// слова из getTopicProgress), а не по угадайке "раз тема done — все части done,
// раз current — ровно половина". "current" — первая ещё не полностью пройденная
// часть, всё, что дальше — locked, всё, что раньше — done.
function computeSubLessons(count, points) {
  const n = Math.max(1, Math.ceil(count / CHUNK_SIZE));
  const subs = [];
  let unlockedNext = true;
  for (let i = 0; i < n; i++) {
    const from = i * CHUNK_SIZE + 1;
    const to = Math.min((i + 1) * CHUNK_SIZE, count);
    const chunkPoints = points ? points.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE) : [];
    const isDone = chunkPoints.length > 0 && chunkPoints.every((p) => p >= 5);
    let status;
    if (!points) status = i === 0 ? "current" : "locked"; // прогресс ещё грузится
    else if (isDone) status = "done";
    else if (unlockedNext) status = "current";
    else status = "locked";
    if (!isDone) unlockedNext = false;
    subs.push({ index: i, label: `Часть ${i + 1}`, range: `${from}–${to} слов`, status, offset: i * CHUNK_SIZE, limit: to - from + 1 });
  }
  return subs;
}

function SubLessonRow({ sub, color, onOpen }) {
  const isDone = sub.status === "done";
  const isCurrent = sub.status === "current";
  const isLocked = sub.status === "locked";

  return (
    <button
      onClick={() => !isLocked && onOpen(sub)}
      disabled={isLocked}
      className="w-full flex items-center gap-3 py-2"
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: isCurrent ? tokens.accentGradient : isDone ? `${color}22` : tokens.track,
        }}
      >
        {isDone && <Check size={13} color={color} strokeWidth={3} />}
        {isCurrent && <Play size={11} color="#FBF9F4" fill="#FBF9F4" />}
        {isLocked && <Lock size={11} color={tokens.textSecondary} />}
      </div>
      <div className="flex-1 text-left">
        <p className="text-[13px] font-semibold" style={{ color: isLocked ? tokens.textSecondary : tokens.textPrimary }}>
          {sub.label}
        </p>
        <p className="text-[11px]" style={{ color: tokens.textSecondary }}>{sub.range}</p>
      </div>
      {!isLocked && <ChevronRight size={15} color={tokens.textSecondary} />}
    </button>
  );
}

function TopicNode({ topic, color, isExpanded, onToggle, onOpenLesson, onRepeat }) {
  const isDone = topic.status === "done";
  const isCurrent = topic.status === "current";
  const isLocked = topic.status === "locked";
  const [points, setPoints] = useState(null); // null пока грузится реальный прогресс частей

  useEffect(() => {
    if (!isExpanded || isLocked) return;
    let cancelled = false;
    getTopicProgress({ level: topic.level, topic: topic.name }).then((res) => {
      if (!cancelled) setPoints(res.points || []);
    });
    return () => { cancelled = true; };
  }, [isExpanded, isLocked, topic.level, topic.name]);

  const subLessons = computeSubLessons(topic.count, points);

  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center shrink-0">
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{
            background: isCurrent ? tokens.accentGradient : isDone ? `${color}22` : tokens.card,
            border: isCurrent ? "none" : `1px solid ${tokens.track}`,
          }}
        >
          {isDone && <Check size={18} color={color} strokeWidth={3} />}
          {isCurrent && <Play size={16} color="#FBF9F4" fill="#FBF9F4" />}
          {isLocked && <Lock size={15} color={tokens.textSecondary} />}
        </div>
        <div className="w-0.5 flex-1 my-1" style={{ background: tokens.track, minHeight: 22 }} />
      </div>

      <div
        className="flex-1 rounded-2xl mb-3 overflow-hidden"
        style={{
          background: isCurrent ? tokens.cardActive : tokens.card,
          opacity: isLocked ? 0.75 : 1,
          border: isCurrent ? `1px solid ${tokens.accentTeal}55` : isExpanded ? `1px solid ${color}50` : "1px solid transparent",
        }}
      >
        <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold text-[14px] leading-snug" style={{ color: tokens.textPrimary }}>{topic.name}</p>
            <p className="text-[12px] mt-0.5" style={{ color: tokens.textSecondary }}>
              {topic.count} слов · {subLessons.length} {subLessons.length === 1 ? "подтема" : "подтемы"}
            </p>
          </div>
          <ChevronRight
            size={16}
            color={tokens.textSecondary}
            style={{ transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 150ms ease" }}
          />
        </button>

        {isExpanded && (
          <div className="px-4 pb-3 pt-1" style={{ borderTop: `1px solid ${tokens.track}` }}>
            {points === null && !isLocked && (
              <div className="flex items-center gap-2 py-2">
                <Loader2 size={14} color={tokens.accentTeal} className="animate-spin" />
                <span className="text-[11.5px]" style={{ color: tokens.textSecondary }}>Считаем прогресс по частям…</span>
              </div>
            )}
            {subLessons.map((s) => (
              <SubLessonRow key={s.index} sub={s} color={color} onOpen={(sub) => onOpenLesson(topic, sub)} />
            ))}
            {isDone && (
              <button
                onClick={() => onRepeat(topic)}
                className="w-full mt-2 flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full font-bold text-[12.5px]"
                style={{ background: tokens.accentGradient, color: "#FBF9F4" }}
              >
                <RotateCcw size={13} /> Повторить всю тему
              </button>
            )}
            {isLocked && (
              <p className="text-[11.5px] mt-1 text-center" style={{ color: tokens.textSecondary }}>
                Откроется после прохождения предыдущей темы
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function PathScreen({ onOpenLesson, onRepeatTopic, onOpenSpecialTrack }) {
  const [openLevel, setOpenLevel] = useState("A1");
  const [expandedTopicId, setExpandedTopicId] = useState(null);
  const [levels, setLevels] = useState(null); // null = загрузка

  useEffect(() => {
    getPath().then(({ topics }) => setLevels(groupIntoLevels(topics || [])));
  }, []);

  return (
    <div className="px-6 pt-6 pb-2 flex-1 overflow-y-auto">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Путь · 257 тем</p>
      <h1 className="text-3xl font-extrabold mt-1" style={{ color: tokens.textPrimary }}>A1 → B2</h1>
      <p className="text-[13px] mt-1 mb-4" style={{ color: tokens.textSecondary }}>
        Тапни по теме — внутри подтемы, можно выбрать, что пройти или повторить
      </p>

      {levels === null && (
        <div className="flex flex-col items-center gap-2 mt-10">
          <Loader2 size={22} color={tokens.accentTeal} className="animate-spin" />
          <p className="text-[12.5px]" style={{ color: tokens.textSecondary }}>Считаем прогресс по темам…</p>
        </div>
      )}

      {levels !== null && (
        <div className="flex flex-col gap-3">
          {levels.map((lvl) => {
            const isOpen = openLevel === lvl.level;
            const color = levelColor[lvl.level];
            const doneCount = lvl.topics.filter((t) => t.status === "done").length;
            return (
              <div key={lvl.level}>
                <button
                  onClick={() => setOpenLevel(isOpen ? null : lvl.level)}
                  className="w-full flex items-center justify-between rounded-2xl px-4 py-3.5"
                  style={{ background: tokens.card }}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-extrabold rounded-full px-2.5 py-1" style={{ background: `${color}22`, color }}>{lvl.level}</span>
                    <div className="text-left">
                      <p className="font-bold text-[14px]" style={{ color: tokens.textPrimary }}>{lvl.subtitle}</p>
                      <p className="text-[11.5px]" style={{ color: tokens.textSecondary }}>{doneCount}/{lvl.topics.length} тем открыто</p>
                    </div>
                  </div>
                  <span
                    className="text-[18px]"
                    style={{ color: tokens.textSecondary, transform: isOpen ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform 150ms ease" }}
                  >⌄</span>
                </button>
                {isOpen && (
                  <div className="pt-4 pl-1">
                    {lvl.topics.map((t) => (
                      <TopicNode
                        key={t.id}
                        topic={{ ...t, level: lvl.level }}
                        color={color}
                        isExpanded={expandedTopicId === t.id}
                        onToggle={() => setExpandedTopicId(expandedTopicId === t.id ? null : t.id)}
                        onOpenLesson={onOpenLesson}
                        onRepeat={onRepeatTopic}
                      />
                    ))}
                    {/* 8 — «История Узбекистана» и «Законодательство РУз»: отдельные
                        спецкурсы, изучаются только по нажатию, без привязки к уровню
                        языка — размещены как отдельный блок в конце уровня A1 */}
                    {lvl.level === "A1" && (
                      <div className="flex flex-col gap-2 mt-1 mb-2">
                        <button
                          onClick={() => onOpenSpecialTrack?.("history")}
                          className="w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between"
                          style={{ background: tokens.card, border: `1px dashed ${tokens.track}` }}
                        >
                          <div>
                            <p className="font-bold text-[13.5px]" style={{ color: tokens.textPrimary }}>🏛 История Узбекистана</p>
                            <p className="text-[11.5px] mt-0.5" style={{ color: tokens.textSecondary }}>отдельный курс · открывается вручную</p>
                          </div>
                          <ChevronRight size={15} color={tokens.textSecondary} />
                        </button>
                        <button
                          onClick={() => onOpenSpecialTrack?.("law")}
                          className="w-full text-left rounded-2xl px-4 py-3 flex items-center justify-between"
                          style={{ background: tokens.card, border: `1px dashed ${tokens.track}` }}
                        >
                          <div>
                            <p className="font-bold text-[13.5px]" style={{ color: tokens.textPrimary }}>⚖️ Законодательство РУз</p>
                            <p className="text-[11.5px] mt-0.5" style={{ color: tokens.textSecondary }}>отдельный курс · открывается вручную</p>
                          </div>
                          <ChevronRight size={15} color={tokens.textSecondary} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
