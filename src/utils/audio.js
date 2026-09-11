// 1 — общий модуль воспроизведения аудио. Раньше идентичный код (с молчаливым
// .catch(() => {})) был продублирован в TrainerScreen.jsx и DictionaryScreen.jsx —
// ЛЮБАЯ причина отказа (неправильный формат ссылки, CORS, 404, недоступный файл)
// проглатывалась без единого следа, поэтому "звук не идёт" было невозможно
// диагностировать. Теперь ошибка хотя бы видна в консоли (F12 / удалённый
// дебаг через Eruda в Telegram), и типичная причина — ссылка на Google Drive
// в виде "поделиться" (.../file/d/ID/view), которую <audio> не умеет
// проигрывать напрямую, — исправляется автоматически.
import { useRef } from "react";

// Приводит ссылку вида https://drive.google.com/file/d/ID/view?usp=sharing
// или https://drive.google.com/open?id=ID к прямой ссылке на контент, которую
// умеет проигрывать HTML5 <audio>. Любые другие ссылки (свой сервер, S3,
// GitHub Pages и т.д.) возвращаются как есть — трогаем только Google Drive.
export function normalizeAudioUrl(url) {
  if (!url) return url;
  let trimmed = url.trim();

  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (fileMatch) trimmed = `https://drive.google.com/uc?export=download&id=${fileMatch[1]}`;

  const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([^&]+)/);
  if (openMatch) trimmed = `https://drive.google.com/uc?export=download&id=${openMatch[1]}`;

  const ucMatch = trimmed.match(/drive\.google\.com\/uc\?.*[?&]id=([^&]+)/);
  if (ucMatch && !/export=download/.test(trimmed)) {
    trimmed = `https://drive.google.com/uc?export=download&id=${ucMatch[1]}`;
  }

  // 3 — если сама страница открыта по https (а GitHub Pages/Telegram Mini App
  // всегда так), а ссылка на аудио — по http://, браузер молча блокирует такой
  // "смешанный контент" (mixed content) — ЗВУК НЕ ИГРАЕТ, и в отличие от
  // большинства ошибок это даже не всегда попадает в console.error. Раз уж
  // страница https, почти наверняка и сам файл доступен по https — поднимаем
  // схему принудительно.
  if (typeof window !== "undefined" && window.location?.protocol === "https:" && trimmed.startsWith("http://")) {
    trimmed = "https://" + trimmed.slice("http://".length);
  }

  return trimmed;
}

// 2.1 — 1-е прослушивание x1, 2-е и 3-е — x0.75, дальше снова x1. Счётчик
// держим по URL, чтобы одно и то же слово/пример считалось отдельно от других.
export function usePlayer() {
  const countsRef = useRef({});
  return (rawUrl) => {
    if (!rawUrl) return;
    const url = normalizeAudioUrl(rawUrl);
    const count = (countsRef.current[url] || 0) + 1;
    countsRef.current[url] = count;
    const rate = count === 2 || count === 3 ? 0.75 : 1;

    const audio = new Audio(url);
    audio.playbackRate = rate;
    audio.addEventListener("error", () => {
      // eslint-disable-next-line no-console
      console.warn("[audio] не удалось загрузить/проиграть файл:", url, audio.error);
    });
    audio.play().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[audio] play() отклонён:", url, err);
    });
  };
}
