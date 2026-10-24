import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ReactLenis } from "lenis/react";
import "lenis/dist/lenis.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ReactLenis root options={{ lerp: 0.2, wheelMultiplier: 0.65, smoothWheel: true, syncTouch: false, anchors: true, allowNestedScroll: true, stopInertiaOnNavigate: true, respectReducedMotion: true }}>
      <App />
    </ReactLenis>
  </React.StrictMode>,
);
