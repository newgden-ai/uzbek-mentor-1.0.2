import React from "react";
import { tokens } from "../theme.js";

const Ground = () => (
  <path d="M4 86 h92" stroke="#B8AA92" strokeWidth="4" strokeLinecap="round" />
);

const Scaffold = ({ x, height }) => (
  <g stroke="#A99A82" strokeWidth="1.4" opacity="0.8">
    <line x1={x} y1={86} x2={x} y2={86 - height} />
    <line x1={x + 10} y1={86} x2={x + 10} y2={86 - height} />
    {Array.from({ length: Math.floor(height / 10) }).map((_, i) => (
      <line key={i} x1={x} y1={86 - i * 10 - 5} x2={x + 10} y2={86 - i * 10 - 5} />
    ))}
  </g>
);

/**
 * stage: 0 (пусто) .. 5 (готово, ярко). decay: 0 (цвет) .. 1 (чб, "нужно повторить")
 * Используется ТОЛЬКО там, где речь про конкретное слово/словосочетание — не про темы/юниты.
 */
export function LandmarkStage({ stage = 0, decay = 0, size = 96 }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ filter: decay > 0 ? `grayscale(${decay})` : "none", transition: "filter 400ms ease" }}
    >
      <Ground />
      {stage >= 1 && <rect x="22" y="80" width="56" height="6" rx="1.5" fill="#8C7A5E" />}
      {stage === 2 && (
        <>
          <rect x="24" y="62" width="14" height="18" fill="#C9B79A" />
          <rect x="62" y="62" width="14" height="18" fill="#C9B79A" />
          <rect x="40" y="70" width="20" height="10" fill="#B8A585" />
          <Scaffold x={24} height={26} />
          <Scaffold x={62} height={26} />
        </>
      )}
      {stage === 3 && (
        <>
          <rect x="22" y="50" width="16" height="30" fill="#C9B79A" />
          <rect x="62" y="50" width="16" height="30" fill="#C9B79A" />
          <path d="M40 80 L40 58 Q50 44 60 58 L60 80 Z" fill="#D6C4A4" stroke="#B8A585" strokeWidth="1" />
          <Scaffold x={22} height={38} />
          <Scaffold x={62} height={38} />
        </>
      )}
      {stage === 4 && (
        <>
          <rect x="20" y="40" width="16" height="40" fill="#D8C6A6" />
          <rect x="64" y="40" width="16" height="40" fill="#D8C6A6" />
          <circle cx="28" cy="36" r="6" fill="#CBB994" />
          <circle cx="72" cy="36" r="6" fill="#CBB994" />
          <path d="M38 80 L38 52 Q50 34 62 52 L62 80 Z" fill="#E2D2B4" stroke="#B8A585" strokeWidth="1" />
          <circle cx="50" cy="40" r="12" fill="#D8C6A6" />
          <Scaffold x={64} height={10} />
        </>
      )}
      {stage === 5 && (
        <>
          <rect x="18" y="38" width="14" height="42" fill="#2C7C6C" />
          <rect x="68" y="38" width="14" height="42" fill="#2C7C6C" />
          <circle cx="25" cy="34" r="7" fill="#C88D49" />
          <circle cx="75" cy="34" r="7" fill="#C88D49" />
          <path d="M34 80 L34 50 Q50 28 66 50 L66 80 Z" fill="#F4EBD8" stroke="#C88D49" strokeWidth="1.5" />
          <path d="M40 80 L40 56 Q50 42 60 56 L60 80 Z" fill="#2C7C6C" />
          <path d="M43 80 L43 60 Q50 50 57 60 L57 80 Z" fill="#1D201C" opacity="0.55" />
          <ellipse cx="50" cy="26" rx="13" ry="11" fill="#2C9E86" />
          <path d="M37 26 Q50 8 63 26" fill="none" stroke="#C88D49" strokeWidth="2" />
          <circle cx="50" cy="8" r="2.2" fill="#C88D49" />
          <rect x="36" y="52" width="28" height="3" fill="#C88D49" opacity="0.8" />
        </>
      )}
    </svg>
  );
}

export const STAGE_INFO = [
  { title: "Пустая поляна", desc: "Слово ещё не изучалось — начни с первого ответа." },
  { title: "Фундамент", desc: "Ты впервые ответил верно. Стройка началась." },
  { title: "Растут стены", desc: "Вспоминаешь слово несколько дней подряд." },
  { title: "Формируется арка", desc: "Слово закрепляется в долгосрочной памяти." },
  { title: "Купол почти готов", desc: "Ещё пара повторов — и слово освоено." },
  { title: "Здание готово", desc: "Слово освоено. Изредка повторяй, чтобы не забыть." },
];

export function StagePopover({ stage, decay, onClose }) {
  const info = STAGE_INFO[stage];
  const isFading = decay > 0;
  return (
    <div
      className="absolute inset-0 flex items-center justify-center px-6 z-20"
      style={{ background: "#1D201C55" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-3xl p-5 flex flex-col items-center text-center"
        style={{ background: tokens.card }}
        onClick={(e) => e.stopPropagation()}
      >
        <LandmarkStage stage={stage} decay={decay} size={88} />
        <p className="font-extrabold text-[16px] mt-3" style={{ color: tokens.textPrimary }}>
          {info.title}
        </p>
        <p className="text-[13px] mt-1 leading-snug" style={{ color: tokens.textSecondary }}>
          {isFading
            ? "Здание потускнело — это слово давно не повторялось. Ответь верно, чтобы вернуть цвет."
            : info.desc}
        </p>
        <button
          onClick={onClose}
          className="mt-4 px-6 py-2 rounded-full font-bold text-[13px]"
          style={{ background: tokens.accentGradient, color: "#FBF9F4" }}
        >
          Понятно
        </button>
      </div>
    </div>
  );
}
