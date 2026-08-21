import React, { useState } from "react";
import { tokens } from "./theme.js";
import BottomNav from "./components/BottomNav.jsx";
import HomeScreen from "./screens/HomeScreen.jsx";
import PathScreen from "./screens/PathScreen.jsx";
import TrainerScreen from "./screens/TrainerScreen.jsx";
import ProgressScreen from "./screens/ProgressScreen.jsx";
import DictionaryScreen from "./screens/DictionaryScreen.jsx";

export default function App() {
  const [tab, setTab] = useState("home");
  // topicFilter !== null → тренажёр должен запросить очередь только по этой теме
  // (пока просто прокидывается в TrainerScreen, реальная фильтрация — когда подключим getQueue)
  const [topicFilter, setTopicFilter] = useState(null);
  // TODO: userLevel должен приходить из user.level через api.js (getCurrentUser), а не
  // жить только в памяти вкладки — иначе после перезахода в мини-апп выбор слетит.
  const [userLevel, setUserLevel] = useState(null);
  const [placementLevel, setPlacementLevel] = useState(null);
  const isLesson = tab === "trainer";

  const startTraining = (topic, subLesson = null) => {
    setTopicFilter({ ...topic, subLesson });
    setPlacementLevel(null);
    setTab("trainer");
  };

  const exitTraining = () => {
    setTopicFilter(null);
    setPlacementLevel(null);
    setTab("home");
  };

  // level === null → пользователь нажал "изменить" в Доме, просто сбрасываем без теста
  const selectLevel = (level) => {
    if (!level) {
      setUserLevel(null);
      return;
    }
    setPlacementLevel(level);
    setTopicFilter(null);
    setTab("trainer");
  };

  const finishPlacement = (confirmedLevel) => {
    setUserLevel(confirmedLevel);
    setPlacementLevel(null);
    setTab("home");
  };

  return (
    <div className="h-screen w-full flex flex-col" style={{ background: tokens.bgGradient }}>
      {tab === "home" && <HomeScreen userLevel={userLevel} onSelectLevel={selectLevel} />}
      {tab === "path" && (
        <PathScreen
          onOpenLesson={(topic, sub) => startTraining(topic, sub)}
          onRepeatTopic={(topic) => startTraining(topic)}
        />
      )}
      {tab === "trainer" && (
        <TrainerScreen
          topicFilter={topicFilter}
          placementLevel={placementLevel}
          onFinishPlacement={finishPlacement}
          onExit={exitTraining}
        />
      )}
      {tab === "progress" && <ProgressScreen />}
      {tab === "dictionary" && <DictionaryScreen />}
      {!isLesson && <BottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
