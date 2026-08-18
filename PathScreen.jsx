import React, { useState } from "react";
import { Check, Lock, Play } from "lucide-react";
import { tokens, levelColor } from "../theme.js";
import { LEVELS } from "../data/words.js";

function TopicNode({ topic, color }) {
  const isDone = topic.status === "done";
  const isCurrent = topic.status === "current";
  const isLocked = topic.status === "locked";

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
        className="flex-1 rounded-2xl px-4 py-3 mb-3"
        style={{
          background: isCurrent ? tokens.cardActive : tokens.card,
          opacity: isLocked ? 0.6 : 1,
          border: isCurrent ? `1px solid ${tokens.accentTeal}55` : "1px solid transparent",
        }}
      >
        <p className="font-bold text-[14px] leading-snug" style={{ color: tokens.textPrimary }}>{topic.name}</p>
        <p className="text-[12px] mt-0.5" style={{ color: tokens.textSecondary }}>{topic.count} слов</p>
      </div>
    </div>
  );
}

export default function PathScreen() {
  const [openLevel, setOpenLevel] = useState("A1");

  return (
    <div className="px-6 pt-6 pb-2 flex-1 overflow-y-auto">
      <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Путь · 257 тем</p>
      <h1 className="text-3xl font-extrabold mt-1" style={{ color: tokens.textPrimary }}>A1 → B2</h1>
      <p className="text-[13px] mt-1 mb-4" style={{ color: tokens.textSecondary }}>Каждая тема открывается по порядку, как в базе слов</p>

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
                  {lvl.topics.map((t) => <TopicNode key={t.id} topic={t} color={color} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
