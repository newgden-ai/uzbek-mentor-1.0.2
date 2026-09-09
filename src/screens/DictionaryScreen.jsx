import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, ChevronDown, ArrowDownAZ, Loader2, AlertTriangle, Volume2 } from "lucide-react";
import { tokens } from "../theme.js";
import { getDictionary } from "../api.js";
import { LandmarkStage } from "../components/LandmarkStage.jsx";
import { TeaBowl } from "../components/TeaBowl.jsx";

const DEBOUNCE_MS = 350;

// 2.1 — 1-е прослушивание x1, 2-е и 3-е — x0.75, дальше снова x1 (счётчик по URL,
// живёт на весь экран — держится, даже если карточку свернуть/развернуть заново).
function usePlayer() {
  const countsRef = useRef({});
  return (url) => {
    if (!url) return;
    const count = (countsRef.current[url] || 0) + 1;
    countsRef.current[url] = count;
    const rate = count === 2 || count === 3 ? 0.75 : 1;
    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.play().catch(() => {});
  };
}

const BAND_LABELS = {
  none: "Не изучено",
  poor: "Плохо изучено",
  good: "Изучено хорошо",
  great: "Изучено отлично",
  excellent: "Превосходно",
};

// 1.6/2.3 — пиала с цифрой: показывает скрытый от игры балл (0-15) конкретного слова.
function PointsPopover({ points, band, decay, onClose }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-6 z-20" style={{ background: "#1D201C55" }} onClick={onClose}>
      <div className="w-full max-w-xs rounded-3xl p-5 flex flex-col items-center text-center" style={{ background: tokens.card }} onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <TeaBowl size={72} />
          <span className="absolute inset-0 flex items-center justify-center font-extrabold text-[20px] pt-3" style={{ color: tokens.textPrimary }}>{points}</span>
        </div>
        <p className="font-extrabold text-[16px] mt-2" style={{ color: tokens.textPrimary }}>{BAND_LABELS[band] || BAND_LABELS.none}</p>
        <p className="text-[12.5px] mt-1" style={{ color: tokens.textSecondary }}>
          {decay > 0
            ? "Балл начал снижаться — слово давно не повторялось, зайди в тренажёр"
            : "Балл растёт за верные ответы в упражнениях и падает при ошибках"}
        </p>
        <button onClick={onClose} className="mt-4 px-6 py-2 rounded-full font-bold text-[13px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
          Понятно
        </button>
      </div>
    </div>
  );
}

export default function DictionaryScreen() {
  const [query, setQuery] = useState("");
  const [sortLang, setSortLang] = useState("ru");
  const [expanded, setExpanded] = useState(null);
  const play = usePlayer();
  const [popover, setPopover] = useState(null);
  const [words, setWords] = useState(null); // null = загрузка
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setError(null);
      try {
        const res = await getDictionary({ query: query.trim() || undefined });
        if (res.error) throw new Error(res.error);
        setWords(res.words || []);
      } catch (err) {
        setError(String(err.message || err));
        setWords([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const filtered = useMemo(() => {
    if (!words) return [];
    return [...words].sort((a, b) => a[sortLang].localeCompare(b[sortLang], sortLang === "ru" ? "ru" : "en"));
  }, [words, sortLang]);


  return (
    <div className="relative flex-1 flex flex-col overflow-hidden">
      {popover && <PointsPopover points={popover.points} band={popover.band} decay={popover.decay} onClose={() => setPopover(null)} />}


      <div className="px-6 pt-6 pb-3">
        <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>8781 слово · A1–B2</p>
        <h1 className="text-3xl font-extrabold mt-1" style={{ color: tokens.textPrimary }}>База</h1>

        <div className="flex items-center gap-2 rounded-2xl px-4 py-3 mt-4" style={{ background: tokens.card }}>
          <Search size={17} color={tokens.textSecondary} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти слово — рус или uz"
            className="flex-1 bg-transparent outline-none text-[16px] font-medium placeholder:font-normal"
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
        {words === null && !error && (
          <div className="flex flex-col items-center gap-2 mt-10">
            <Loader2 size={22} color={tokens.accentTeal} className="animate-spin" />
            <p className="text-[12.5px]" style={{ color: tokens.textSecondary }}>Ищем в базе…</p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center gap-2 mt-10 px-4 text-center">
            <AlertTriangle size={22} color={tokens.wrong} />
            <p className="text-[13px] font-bold" style={{ color: tokens.textPrimary }}>Не удалось загрузить словарь</p>
            <p className="text-[12px]" style={{ color: tokens.textSecondary }}>{error}</p>
          </div>
        )}

        {words !== null && !error && filtered.length > 0 && !query && (
          <p className="text-[11.5px] px-1 -mt-1 mb-1" style={{ color: tokens.textSecondary }}>
            Показаны первые {filtered.length} — используй поиск, чтобы найти конкретное слово
          </p>
        )}
        {words !== null && !error && filtered.map((w) => {
          const isOpen = expanded === w.id;
          return (
            <div key={w.id} className="rounded-2xl overflow-hidden" style={{ background: tokens.card }}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpanded(isOpen ? null : w.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(isOpen ? null : w.id); }}
                className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
                aria-label={isOpen ? "Свернуть карточку слова" : "Открыть слово — перевод и примеры"}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); setPopover({ points: w.points ?? 0, band: w.band || "none", decay: w.decay || 0 }); }}
                    className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center"
                    style={{ background: tokens.cardActive }}
                    aria-label="Стадия заучивания слова"
                  >
                    <LandmarkStage stage={w.stage} decay={w.decay} size={30} />
                  </button>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: tokens.accentTeal }}>{w.topic}</p>
                    <div className="flex items-baseline gap-2 mt-0.5 flex-wrap">
                      <span className="font-bold text-[16px]" style={{ color: tokens.textPrimary }}>{w.uz}</span>
                      <span className="text-[13px]" style={{ color: tokens.textSecondary }}>— {w.ru}</span>
                      {w.audioUrl && (
                        <button onClick={(e) => { e.stopPropagation(); play(w.audioUrl); }} aria-label="Прослушать слово">
                          <Volume2 size={14} color={tokens.accentTeal} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  className="shrink-0 rounded-full p-2 ml-2"
                  style={{ background: isOpen ? tokens.cardActive : "transparent" }}
                >
                  <ChevronDown size={18} color={tokens.accentTeal} style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s ease" }} />
                </div>
              </div>

              {isOpen && (
                <div className="px-5 pb-4 flex flex-col gap-2.5" style={{ borderTop: `1px solid ${tokens.track}` }}>
                  {(w.examples || []).map((ex, i) => (
                    <div key={i} className="pt-2.5">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13px] font-semibold leading-snug" style={{ color: tokens.textPrimary }}>{ex.uz}</p>
                        {ex.audioUrl && (
                          <button onClick={() => play(ex.audioUrl)} aria-label="Прослушать пример">
                            <Volume2 size={12} color={tokens.accentTeal} />
                          </button>
                        )}
                      </div>
                      <p className="text-[12px] mt-0.5 leading-snug" style={{ color: tokens.textSecondary }}>{ex.ru}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {words !== null && !error && filtered.length === 0 && (
          <p className="text-center text-[13px] mt-10" style={{ color: tokens.textSecondary }}>Ничего не найдено — попробуй другой запрос</p>
        )}
      </div>
    </div>
  );
}
