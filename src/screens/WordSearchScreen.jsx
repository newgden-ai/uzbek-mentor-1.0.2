import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Loader2, Check } from "lucide-react";
import { tokens } from "../theme.js";
import { getDictionary } from "../api.js";

const GRID_SIZE = 8;
const FILLER_LETTERS = "ABDEFGHIJKLMNOPQRSTUVXYZ".split("");

function emptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
}

// Кладёт слово в сетку горизонтально или вертикально (без диагоналей и задом
// наперёд — как в ТЗ). Совпадающие буквы можно накладывать друг на друга.
function tryPlaceWord(grid, word) {
  const letters = word.toUpperCase().split("");
  for (let attempt = 0; attempt < 40; attempt++) {
    const horizontal = Math.random() < 0.5;
    const maxRow = horizontal ? GRID_SIZE : GRID_SIZE - letters.length;
    const maxCol = horizontal ? GRID_SIZE - letters.length : GRID_SIZE;
    if (maxRow <= 0 || maxCol <= 0) continue;
    const row = Math.floor(Math.random() * maxRow);
    const col = Math.floor(Math.random() * maxCol);

    let fits = true;
    for (let i = 0; i < letters.length; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      const existing = grid[r][c];
      if (existing && existing !== letters[i]) { fits = false; break; }
    }
    if (!fits) continue;

    const cells = [];
    for (let i = 0; i < letters.length; i++) {
      const r = horizontal ? row : row + i;
      const c = horizontal ? col + i : col;
      grid[r][c] = letters[i];
      cells.push([r, c]);
    }
    return cells;
  }
  return null;
}

function buildPuzzle(words) {
  const grid = emptyGrid();
  const placed = [];
  for (const w of words) {
    const cells = tryPlaceWord(grid, w.uz.replace(/[^a-zA-Zʻ']/g, ""));
    if (cells) placed.push({ word: w, cells });
  }
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (!grid[r][c]) grid[r][c] = FILLER_LETTERS[Math.floor(Math.random() * FILLER_LETTERS.length)];
    }
  }
  return { grid, placed };
}

function cellsBetween(start, end) {
  const [r1, c1] = start, [r2, c2] = end;
  if (r1 !== r2 && c1 !== c2) return null; // только горизонталь/вертикаль
  const cells = [];
  if (r1 === r2) {
    const [from, to] = c1 <= c2 ? [c1, c2] : [c2, c1];
    for (let c = from; c <= to; c++) cells.push([r1, c]);
  } else {
    const [from, to] = r1 <= r2 ? [r1, r2] : [r2, r1];
    for (let r = from; r <= to; r++) cells.push([r, c1]);
  }
  return cells;
}

function sameCells(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a.map((c) => c.join(",")));
  return b.every((c) => setA.has(c.join(",")));
}

export default function WordSearchScreen({ onExit }) {
  const [sourceWords, setSourceWords] = useState(null); // null = загрузка
  const [puzzle, setPuzzle] = useState(null);
  const [found, setFound] = useState([]);
  const [dragStart, setDragStart] = useState(null);
  const [dragCurrent, setDragCurrent] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    getDictionary({}).then((res) => {
      const pool = (res.words || []).filter((w) => /^[a-zA-Zʻ'\u02BB]+$/.test(w.uz) && w.uz.length >= 3 && w.uz.length <= 8);
      const learned = pool.filter((w) => (w.points || 0) > 0);
      const chosen = (learned.length >= 4 ? learned : pool)
        .sort(() => Math.random() - 0.5)
        .slice(0, 6);
      setSourceWords(chosen);
    });
  }, []);

  useEffect(() => {
    if (sourceWords && sourceWords.length > 0) setPuzzle(buildPuzzle(sourceWords));
  }, [sourceWords]);

  const selection = useMemo(() => {
    if (!dragStart || !dragCurrent) return [];
    return cellsBetween(dragStart, dragCurrent) || [];
  }, [dragStart, dragCurrent]);

  const foundCellSet = useMemo(() => {
    const s = new Set();
    found.forEach((f) => f.cells.forEach((c) => s.add(c.join(","))));
    return s;
  }, [found]);

  const cellFromPoint = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.dataset || el.dataset.row == null) return null;
    return [Number(el.dataset.row), Number(el.dataset.col)];
  };

  const handleStart = (r, c) => { setDragStart([r, c]); setDragCurrent([r, c]); };
  const handleMove = (e) => {
    if (!dragStart) return;
    const point = e.touches ? e.touches[0] : e;
    const cell = cellFromPoint(point.clientX, point.clientY);
    if (cell) setDragCurrent(cell);
  };
  const handleEnd = () => {
    if (dragStart && dragCurrent && puzzle) {
      const cells = cellsBetween(dragStart, dragCurrent);
      if (cells && cells.length > 1) {
        const match = puzzle.placed.find((p) => !found.includes(p) && sameCells(p.cells, cells));
        if (match) setFound([...found, match]);
      }
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  const allFound = puzzle && found.length === puzzle.placed.length && puzzle.placed.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-5 pt-6 pb-2 flex items-center justify-between shrink-0">
        <div>
          <p className="text-xs font-bold tracking-widest uppercase" style={{ color: tokens.textSecondary }}>Игра</p>
          <h1 className="text-2xl font-extrabold" style={{ color: tokens.textPrimary }}>Найди слова</h1>
        </div>
        <button onClick={onExit} aria-label="Закрыть игру">
          <X size={22} color={tokens.textSecondary} />
        </button>
      </div>

      {(!puzzle || sourceWords === null) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Loader2 size={26} color={tokens.accentTeal} className="animate-spin" />
          <p className="text-[13px]" style={{ color: tokens.textSecondary }}>Собираем слова из твоей базы…</p>
        </div>
      )}

      {puzzle && sourceWords !== null && puzzle.placed.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-8 text-center">
          <p className="font-bold text-[15px]" style={{ color: tokens.textPrimary }}>Пока рано для этой игры</p>
          <p className="text-[13px]" style={{ color: tokens.textSecondary }}>Выучи несколько слов в тренажёре — тогда они появятся здесь</p>
        </div>
      )}

      {puzzle && puzzle.placed.length > 0 && (
        <>
          <div className="px-5 flex flex-wrap gap-2 pb-3 shrink-0">
            {puzzle.placed.map((p, i) => {
              const isFound = found.includes(p);
              return (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full text-[12.5px] font-bold flex items-center gap-1"
                  style={{
                    background: isFound ? tokens.correctBg : tokens.card,
                    color: isFound ? tokens.correct : tokens.textSecondary,
                    textDecoration: isFound ? "line-through" : "none",
                  }}
                >
                  {isFound && <Check size={12} />}
                  {p.word.uz}
                </span>
              );
            })}
          </div>

          <div
            ref={containerRef}
            className="px-5 pb-6 flex-1 flex items-start justify-center select-none touch-none"
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
          >
            <div
              className="grid gap-1 p-3 rounded-2xl"
              style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, background: tokens.card, width: "100%", maxWidth: 360 }}
            >
              {puzzle.grid.map((row, r) =>
                row.map((letter, c) => {
                  const key = `${r},${c}`;
                  const isFoundCell = foundCellSet.has(key);
                  const isSelecting = selection.some(([sr, sc]) => sr === r && sc === c);
                  return (
                    <div
                      key={key}
                      data-row={r}
                      data-col={c}
                      onMouseDown={() => handleStart(r, c)}
                      onTouchStart={() => handleStart(r, c)}
                      className="aspect-square flex items-center justify-center rounded-lg font-extrabold text-[13px]"
                      style={{
                        background: isFoundCell ? tokens.correctBg : isSelecting ? tokens.cardActive : tokens.bgGradient,
                        color: isFoundCell ? tokens.correct : tokens.textPrimary,
                      }}
                    >
                      {letter}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {allFound && (
            <div className="px-5 pb-5 shrink-0">
              <div className="rounded-2xl px-5 py-4 flex items-center justify-between" style={{ background: tokens.correctBg }}>
                <p className="font-extrabold text-[14px]" style={{ color: tokens.correct }}>Все слова найдены! 🎉</p>
                <button onClick={onExit} className="px-4 py-2 rounded-xl font-bold text-[13px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
                  Готово
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
