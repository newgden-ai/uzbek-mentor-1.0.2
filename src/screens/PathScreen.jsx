import React, { useState } from "react";
import { Check, Lock, Play, RotateCcw, ChevronRight } from "lucide-react";
import { tokens, levelColor } from "../theme.js";
import { LEVELS } from "../data/words.js";

const CHUNK_SIZE = 12; // сколько слов в одной подтеме — держит уроки короткими

// Разбивает тему на подтемы и расставляет статусы в зависимости от статуса темы.
// TODO: когда подключим API — статус подтемы придёт из user_words (реальный прогресс),
// это временное распределение только для демонстрации механики.
function buildSubLessons(topic) {
  const n = Math.max(1, Math.ceil(topic.count / CHUNK_SIZE));
  const subs = Array.from({ length: n }, (_, i) => {
    const from = i * CHUNK_SIZE + 1;
    const to = Math.min((i + 1) * CHUNK_SIZE, topic.count);
    return { index: i, label: `Часть ${i + 1}`, range: `${from}–${to} слов`, status: "locked" };
  });

  if (topic.status === "done") {
    subs.forEach((s) => (s.status = "done"));
  } else if (topic.status === "current") {
    const currentIdx = Math.floor(n / 2);
    subs.forEach((s, i) => (s.status = i < currentIdx ? "done" : i === currentIdx ? "current" : "locked"));
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
  const subLessons = buildSubLessons(topic);

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

export default function PathScreen({ onOpenLesson, onRepeatTopic }) {
  const [openLevel, setOpenLevel] = useState("A1");
  const [expandedTopicId, setExpandedTopicId] = useState(null);

  return (
    <div className="px-6 pt-6 pb-2 flex-1 overflow-y-auto">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Путь · 257 тем</p>
      <h1 className="text-3xl font-extrabold mt-1" style={{ color: tokens.textPrimary }}>A1 → B2</h1>
      <p className="text-[13px] mt-1 mb-4" style={{ color: tokens.textSecondary }}>
        Тапни по теме — внутри подтемы, можно выбрать, что пройти или повторить
      </p>

      <div className="flex flex-col gap-3">
        {LEVELS.map((lvl) => {
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
                      topic={t}
                      color={color}
                      isExpanded={expandedTopicId === t.id}
                      onToggle={() => setExpandedTopicId(expandedTopicId === t.id ? null : t.id)}
                      onOpenLesson={onOpenLesson}
                      onRepeat={onRepeatTopic}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
