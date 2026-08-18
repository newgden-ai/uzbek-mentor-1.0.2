import React, { useState } from "react";
import { tokens } from "./theme.js";
import BottomNav from "./components/BottomNav.jsx";
import HomeScreen from "./screens/HomeScreen.jsx";
import PathScreen from "./screens/PathScreen.jsx";
import TrainerScreen from "./screens/TrainerScreen.jsx";
import ProgressScreen from "./screens/ProgressScreen.jsx";
import DictionaryScreen from "./screens/DictionaryScreen.jsx";

const SCREENS = {
  home: HomeScreen,
  path: PathScreen,
  trainer: TrainerScreen,
  progress: ProgressScreen,
  dictionary: DictionaryScreen,
};

export default function App() {
  const [tab, setTab] = useState("home");
  const Screen = SCREENS[tab];
  // в режиме урока (тренажёр) нижний нав скрыт — фокус на задании, как в Duolingo/Memrise
  const isLesson = tab === "trainer";

  return (
    <div className="h-screen w-full flex flex-col" style={{ background: tokens.bgGradient }}>
      {isLesson ? <TrainerScreen onExit={() => setTab("home")} /> : <Screen />}
      {!isLesson && <BottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
