import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// ここを変更
// import "./index.css";
import "./App.css";   // ★ モーダルCSSを含んだ方を読み込む

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
