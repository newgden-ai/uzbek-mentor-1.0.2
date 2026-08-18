import React, { useState, useMemo } from "react";
import { Search, ChevronDown, ArrowDownAZ } from "lucide-react";
import { tokens } from "../theme.js";
import { WORDS } from "../data/words.js";
import { LandmarkStage, StagePopover } from "../components/LandmarkStage.jsx";

export default function DictionaryScreen() {
  const [query, setQuery] = useState("");
  const [sortLang, setSortLang] = useState("ru");
  const [expanded, setExpanded] = useState(null);
  const [popover, setPopover] = useState(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = WORDS;
    if (q) {
      list = list.filter((w) => w.ru.toLowerCase().includes(q) || w.uz.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => a[sortLang].localeCompare(b[sortLang], sortLang === "ru" ? "ru" : "en"));
  }, [query, sortLang]);

  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {popover && <StagePopover stage={popover.stage} decay={popover.decay} onClose={() => setPopover(null)} />}

      <div className="px-6 pt-6 pb-3">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>8781 слово · A1–B2</p>
        <h1 className="text-3xl font-extrabold mt-1" style={{ color: tokens.textPrimary }}>База</h1>

        <div className="flex items-center gap-2 rounded-2xl px-4 py-3 mt-4" style={{ background: tokens.card }}>
          <Search size={17} color={tokens.textSecondary} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти слово — рус или uz"
            className="flex-1 bg-transparent outline-none text-[14px] font-medium placeholder:font-normal"
            style={{ color: tokens.textPrimary }}
          />
        </div>

        <div className="flex items-center gap-2 mt-3">
          <ArrowDownAZ size={15} color={tokens.textSecondary} />
          <span className="text-[12px] font-semibold mr-1" style={{ color: tokens.textSecondary }}>Сортировка:</span>
          {[{ key: "ru", label: "Русский" }, { key: "uz", label: "O'zbek" }].map((opt) => {
            const isActive = sortLang === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setSortLang(opt.key)}
                className="rounded-full px-3 py-1 text-[12px] font-bold"
                style={{ background: isActive ? tokens.accentGradient : tokens.card, color: isActive ? "#FBF9F4" : tokens.textSecondary }}
              >{opt.label}</button>
            );
          })}
        </div>
      </div>

      <div className="px-6 flex flex-col gap-2.5 pb-6 flex-1 overflow-y-auto">
        {filtered.map((w) => {
          const isOpen = expanded === w.id;
          return (
            <div key={w.id} className="rounded-2xl overflow-hidden" style={{ background: tokens.card }}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setPopover({ stage: w.stage, decay: w.decay }); }}
                    className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: tokens.cardActive }}
                    aria-label="Стадия заучивания слова"
                  >
                    <LandmarkStage stage={w.stage} decay={w.decay} size={30} />
                  </button>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: tokens.accentTeal }}>{w.topic}</p>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="font-bold text-[16px]" style={{ color: tokens.textPrimary }}>{w.ru}</span>
                      <span className="text-[13px]" style={{ color: tokens.textSecondary }}>— {w.uz}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setExpanded(isOpen ? null : w.id)}
                  className="shrink-0 rounded-full p-2 ml-2"
                  style={{ background: isOpen ? tokens.cardActive : "transparent" }}
                  aria-label="Показать примеры"
                >
                  <ChevronDown size={18} color={tokens.accentTeal} style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
                </button>
              </div>

              {isOpen && (
                <div className="px-5 pb-4 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${tokens.track}` }}>
                  {w.examples.map((ex, i) => (
                    <div key={i} className="pt-2.5">
                      <p className="text-[13px] font-semibold leading-snug" style={{ color: tokens.textPrimary }}>{ex.uz}</p>
                      <p className="text-[12px] mt-0.5 leading-snug" style={{ color: tokens.textSecondary }}>{ex.ru}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-center text-[13px] mt-10" style={{ color: tokens.textSecondary }}>Ничего не найдено — попробуй другой запрос</p>
        )}
      </div>
    </div>
  );
}
