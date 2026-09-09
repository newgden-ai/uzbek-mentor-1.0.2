import React, { useState, useEffect, useRef } from "react";
import { X, ArrowLeftRight, Loader2, Search } from "lucide-react";
import { tokens } from "../theme.js";
import { translateText, getSimilarWords } from "../api.js";

const DEBOUNCE_MS = 400;

export default function TranslatorScreen({ onExit }) {
  const [text, setText] = useState("");
  const [direction, setDirection] = useState("ru-uz"); // "ru-uz" | "uz-ru"
  const [translated, setTranslated] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [similar, setSimilar] = useState([]);
  const debounceRef = useRef(null);

  const [sl, tl] = direction.split("-");

  const runTranslate = async () => {
    const value = text.trim();
    if (!value) return;
    setLoading(true);
    setError(null);
    const res = await translateText(value, sl, tl);
    setLoading(false);
    if (res.error) setError(res.error);
    else setTranslated(res.translated);
  };

  // Похожие слова ищем только когда пишут по-узбекски — это наша база, она вся в UZ.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (sl !== "uz" || !text.trim()) { setSimilar([]); return; }
    debounceRef.current = setTimeout(async () => {
      const res = await getSimilarWords(text.trim(), 6);
      setSimilar(res.words || []);
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [text, sl]);

  const swapDirection = () => {
    setDirection(direction === "ru-uz" ? "uz-ru" : "ru-uz");
    setTranslated(null);
    setText("");
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between shrink-0">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Инструмент</p>
          <h1 className="text-2xl font-extrabold" style={{ color: tokens.textPrimary }}>Переводчик</h1>
        </div>
        <button onClick={onExit} aria-label="Закрыть">
          <X size={22} color={tokens.textSecondary} />
        </button>
      </div>

      <div className="px-5 flex-1 overflow-y-auto pb-6">
        <div className="flex items-center justify-center gap-3 mt-3 mb-4">
          <span className="px-4 py-1.5 rounded-full text-[13px] font-bold" style={{ background: tokens.card, color: tokens.textPrimary }}>
            {sl === "ru" ? "Русский" : "O'zbek"}
          </span>
          <button onClick={swapDirection} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: tokens.cardActive }}>
            <ArrowLeftRight size={16} color={tokens.accentTeal} />
          </button>
          <span className="px-4 py-1.5 rounded-full text-[13px] font-bold" style={{ background: tokens.card, color: tokens.textPrimary }}>
            {tl === "ru" ? "Русский" : "O'zbek"}
          </span>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setTranslated(null); }}
          placeholder={sl === "ru" ? "Введи текст на русском..." : "O'zbekcha matn kiriting..."}
          rows={3}
          className="w-full rounded-2xl px-4 py-3.5 text-[16px] font-semibold outline-none resize-none"
          style={{ background: tokens.card, color: tokens.textPrimary }}
        />

        <button
          onClick={runTranslate}
          disabled={!text.trim() || loading}
          className="w-full mt-3 rounded-2xl py-3.5 font-extrabold text-[15px] flex items-center justify-center gap-2"
          style={{ background: !text.trim() ? tokens.track : tokens.accentGradient, color: !text.trim() ? tokens.textSecondary : "#FBF9F4" }}
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : "Перевести"}
        </button>

        {error && <p className="text-[12.5px] mt-3 text-center" style={{ color: tokens.wrong }}>{error}</p>}

        {translated && (
          <div className="rounded-2xl px-5 py-4 mt-4" style={{ background: tokens.cardActive }}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: tokens.accentTeal }}>Перевод</p>
            <p className="text-[17px] font-bold" style={{ color: tokens.textPrimary }}>{translated}</p>
          </div>
        )}

        <p className="text-[11px] mt-3 text-center" style={{ color: tokens.textSecondary }}>
          Перевод — свободный текст, не только слова из нашей базы, качество не гарантировано
        </p>

        {similar.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-1.5 mb-2">
              <Search size={13} color={tokens.textSecondary} />
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: tokens.textSecondary }}>Похожие слова в нашей базе</p>
            </div>
            <div className="flex flex-col gap-2">
              {similar.map((w) => (
                <div key={w.id} className="rounded-xl px-4 py-2.5 flex items-center justify-between" style={{ background: tokens.card }}>
                  <div>
                    <span className="font-bold text-[14px]" style={{ color: tokens.textPrimary }}>{w.uz}</span>
                    <span className="text-[13px] ml-2" style={{ color: tokens.textSecondary }}>— {w.ru}</span>
                  </div>
                  <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: tokens.track, color: tokens.textSecondary }}>{w.topic}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
