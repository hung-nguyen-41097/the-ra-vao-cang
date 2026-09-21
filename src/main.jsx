import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import V2Page from "./V2Page.jsx";
import InVeXePage from "./InVeXePage.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/the-ra-vao-v2" element={<V2Page />} />
        <Route path="/in-ve-xe" element={<InVeXePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
