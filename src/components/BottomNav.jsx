import React from "react";
import { Home, Route, Languages, TrendingUp, Layers } from "lucide-react";
import { tokens } from "../theme.js";

export const TABS = [
  { id: "home", icon: Home, label: "Дом" },
  { id: "path", icon: Route, label: "Путь" },
  { id: "trainer", icon: Languages, label: "Язык" },
  { id: "progress", icon: TrendingUp, label: "Прогресс" },
  { id: "dictionary", icon: Layers, label: "База" },
];

export default function BottomNav({ active, onChange }) {
  return (
    <div
      className="mx-3 mb-3 rounded-3xl px-2 py-3 flex items-center justify-between shrink-0"
      style={{ background: tokens.navBg }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <Icon
              size={20}
              color={isActive ? tokens.accentTeal : tokens.textSecondary}
              strokeWidth={isActive ? 2.5 : 2}
            />
            <span
              className="text-[10px] font-semibold"
              style={{ color: isActive ? tokens.textPrimary : tokens.textSecondary }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
