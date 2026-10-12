import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import TheRaVaoCang from "./TheRaVaoCang.jsx";
import InVeXePage from "./InVeXePage.jsx";
import KiemTraPage from "./KiemTraPage.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/the-ra-vao-cang" replace />} />
        <Route path="/the-ra-vao-cang" element={<TheRaVaoCang />} />
        <Route path="/the-ra-vao-cang/kiem-tra" element={<KiemTraPage />} />
        <Route
          path="/the-ra-vao-v2"
          element={<Navigate to="/the-ra-vao-cang" replace />}
        />
        <Route path="/in-ve-xe" element={<InVeXePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
