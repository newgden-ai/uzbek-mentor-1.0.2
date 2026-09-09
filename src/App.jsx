import React, { useState, useEffect } from "react";
import { tokens } from "./theme.js";
import { getCurrentUser, refreshUser, setUserLevel as apiSetUserLevel, flushPendingAnswers, getCheckpointStatus } from "./api.js";
import { GraduationCap } from "lucide-react";
import BottomNav from "./components/BottomNav.jsx";
import HomeScreen from "./screens/HomeScreen.jsx";
import PathScreen from "./screens/PathScreen.jsx";
import TrainerScreen from "./screens/TrainerScreen.jsx";
import ProgressScreen from "./screens/ProgressScreen.jsx";
import DictionaryScreen from "./screens/DictionaryScreen.jsx";
import WordSearchScreen from "./screens/WordSearchScreen.jsx";
import TranslatorScreen from "./screens/TranslatorScreen.jsx";
import SpecialTrackScreen from "./screens/SpecialTrackScreen.jsx";

export default function App() {
  const [tab, setTab] = useState("home");
  const [topicFilter, setTopicFilter] = useState(null);
  const [user, setUser] = useState(null);
  const [userLevel, setUserLevelState] = useState(undefined); // undefined = ещё грузится, null = не выбран
  const [placementLevel, setPlacementLevel] = useState(null);
  const [sessionMode, setSessionMode] = useState("all"); // 1.7: all | new | review
  const [checkpointDue, setCheckpointDue] = useState(false); // 9 — контрольная проверка каждые 500 слов
  const [specialTrack, setSpecialTrack] = useState(null); // 8 — "history" | "law" | null
  const [authError, setAuthError] = useState(null); // 4 — явно показываем, если Telegram-авторизация не прошла
  const isLesson = tab === "trainer" || tab === "wordsearch" || tab === "translator";

  useEffect(() => {
    getCurrentUser().then((u) => {
      // 4 — раньше ошибку авторизации никак не показывали: приложение молча
      // продолжало работать с несуществующим user_id, из-за чего казалось,
      // что "ничего не сохраняется/не синхронизируется", а на деле пользователь
      // просто ни разу не был нормально авторизован. Теперь ошибка видна.
      if (u.error) { setAuthError(u.error); return; }
      setUser(u);
      setUserLevelState(u.level || null);
    });
    // 4 — если с прошлой сессии остались неотправленные ответы (сеть подвела
    // во время тренировки) — дожимаем их при следующем открытии приложения,
    // не дожидаясь, пока пользователь начнёт новую тренировку.
    flushPendingAnswers();
  }, []);

  // 9 — проверяем, не накопилось ли очередных 500 изученных слов, каждый раз
  // при возврате на "Дом" (после тренировки это самое естественное место).
  useEffect(() => {
    if (tab !== "home") return;
    getCheckpointStatus().then((s) => { if (!s.error) setCheckpointDue(Boolean(s.due)); });
  }, [tab]);

  const startCheckpoint = () => {
    setCheckpointDue(false);
    setTopicFilter(null);
    setPlacementLevel(null);
    setSessionMode("checkpoint");
    setTab("trainer");
  };

  const startTraining = (topic, subLesson = null, isRepeat = false) => {
    setTopicFilter({ ...topic, subLesson, repeat: isRepeat });
    setPlacementLevel(null);
    setTab("trainer");
  };

  const startSession = (mode) => {
    setSessionMode(mode);
    setTopicFilter(null);
    setPlacementLevel(null);
    setTab("trainer");
  };

  const exitTraining = () => {
    setTopicFilter(null);
    setPlacementLevel(null);
    setSessionMode("all");
    setTab("home");
    // 3.5/1.4 — streak/xp/бейдж на "Доме" и "Прогрессе" теперь берутся из
    // кеша (см. api.js), поэтому явно обновляем его при выходе из тренировки,
    // чтобы цифры на "Доме" сразу отражали то, что только что прошло.
    refreshUser().then((u) => { setUser(u); setUserLevelState(u.level || null); });
  };

  const selectLevel = (level) => {
    if (!level) {
      setUserLevelState(null); // "изменить" в Доме — просто открыть выбор заново
      return;
    }
    setPlacementLevel(level);
    setTopicFilter(null);
    setTab("trainer");
  };

  const finishPlacement = async (confirmedLevel) => {
    await apiSetUserLevel(confirmedLevel);
    setUserLevelState(confirmedLevel);
    setPlacementLevel(null);
    setTab("home");
  };

  return (
    <div className="h-screen w-full flex flex-col" style={{ background: tokens.bgGradient }}>
      {authError && (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-3">
          <p className="font-extrabold text-[17px]" style={{ color: tokens.textPrimary }}>Не удалось авторизоваться</p>
          <p className="text-[13px]" style={{ color: tokens.textSecondary }}>{authError}</p>
          <p className="text-[12px]" style={{ color: tokens.textSecondary }}>
            Приложение нужно открывать через кнопку меню бота в Telegram — напрямую по ссылке в браузере вход не пройдёт.
          </p>
        </div>
      )}
      {!authError && tab === "home" && userLevel !== undefined && checkpointDue && (
        <div className="mx-6 mt-4 rounded-2xl px-5 py-4 flex items-center gap-3 shrink-0" style={{ background: tokens.card, border: `1px solid ${tokens.accentOchre}55` }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: tokens.accentGradient }}>
            <GraduationCap size={18} color="#FBF9F4" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-[13.5px]" style={{ color: tokens.textPrimary }}>Пора закрепить пройденное</p>
            <p className="text-[12px] mt-0.5" style={{ color: tokens.textSecondary }}>30 заданий по всему изученному материалу</p>
          </div>
          <button onClick={startCheckpoint} className="shrink-0 px-4 py-2 rounded-full font-bold text-[12.5px]" style={{ background: tokens.accentGradient, color: "#FBF9F4" }}>
            Начать
          </button>
        </div>
      )}
      {!authError && tab === "home" && userLevel !== undefined && <HomeScreen user={user} userLevel={userLevel} onSelectLevel={selectLevel} onStartTraining={startSession} onOpenGame={() => setTab("wordsearch")} onOpenTranslator={() => setTab("translator")} />}
      {!authError && tab === "path" && !specialTrack && (
        <PathScreen
          onOpenLesson={(topic, sub) => startTraining(topic, sub, false)}
          onRepeatTopic={(topic) => startTraining(topic, null, true)}
          onOpenSpecialTrack={(track) => setSpecialTrack(track)}
        />
      )}
      {!authError && tab === "path" && specialTrack && (
        <SpecialTrackScreen track={specialTrack} onExit={() => setSpecialTrack(null)} />
      )}
      {!authError && tab === "trainer" && (
        <TrainerScreen
          topicFilter={topicFilter}
          placementLevel={placementLevel}
          mode={sessionMode}
          onFinishPlacement={finishPlacement}
          onExit={exitTraining}
        />
      )}
      {!authError && tab === "progress" && <ProgressScreen user={user} />}
      {!authError && tab === "dictionary" && <DictionaryScreen />}
      {!authError && tab === "wordsearch" && <WordSearchScreen onExit={() => setTab("home")} />}
      {!authError && tab === "translator" && <TranslatorScreen onExit={() => setTab("home")} />}
      {!authError && !isLesson && <BottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
