import React, { useState, useEffect } from "react";
import { tokens } from "./theme.js";
import { getCurrentUser, setUserLevel as apiSetUserLevel } from "./api.js";
import BottomNav from "./components/BottomNav.jsx";
import HomeScreen from "./screens/HomeScreen.jsx";
import PathScreen from "./screens/PathScreen.jsx";
import TrainerScreen from "./screens/TrainerScreen.jsx";
import ProgressScreen from "./screens/ProgressScreen.jsx";
import DictionaryScreen from "./screens/DictionaryScreen.jsx";

export default function App() {
  const [tab, setTab] = useState("home");
  const [topicFilter, setTopicFilter] = useState(null);
  const [user, setUser] = useState(null);
  const [userLevel, setUserLevelState] = useState(undefined); // undefined = ещё грузится, null = не выбран
  const [placementLevel, setPlacementLevel] = useState(null);
  const isLesson = tab === "trainer";

  useEffect(() => {
    getCurrentUser().then((u) => {
      setUser(u);
      setUserLevelState(u.level || null);
    });
  }, []);

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
      {tab === "home" && userLevel !== undefined && <HomeScreen user={user} userLevel={userLevel} onSelectLevel={selectLevel} />}
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
      {tab === "progress" && <ProgressScreen user={user} />}
      {tab === "dictionary" && <DictionaryScreen />}
      {!isLesson && <BottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
