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
  const isLesson = tab === "trainer";

  const startTraining = (topic, subLesson = null) => {
    setTopicFilter({ ...topic, subLesson });
    setTab("trainer");
  };

  const exitTraining = () => {
    setTopicFilter(null);
    setTab("home");
  };

  return (
    <div className="h-screen w-full flex flex-col" style={{ background: tokens.bgGradient }}>
      {tab === "home" && <HomeScreen />}
      {tab === "path" && (
        <PathScreen
          onOpenLesson={(topic, sub) => startTraining(topic, sub)}
          onRepeatTopic={(topic) => startTraining(topic)}
        />
      )}
      {tab === "trainer" && <TrainerScreen topicFilter={topicFilter} onExit={exitTraining} />}
      {tab === "progress" && <ProgressScreen />}
      {tab === "dictionary" && <DictionaryScreen />}
      {!isLesson && <BottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
