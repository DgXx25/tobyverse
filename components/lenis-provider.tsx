"use client";

import { ReactLenis } from "lenis/react";
import { useEffect, useState, type ReactNode } from "react";

// Lower wheel gain limits large jumps; higher lerp settles each input sooner.
const options = {
  lerp: 0.2,
  wheelMultiplier: 0.65,
  smoothWheel: true,
  syncTouch: false,
  anchors: true,
  allowNestedScroll: true,
  stopInertiaOnNavigate: true,
  respectReducedMotion: true,
} as const;

export function LenisProvider({ children }: { children: ReactNode }) {
  // Keep touch scrolling entirely under the browser/OS on phones.
  // Initializing as mobile also keeps server and hydration markup identical.
  const [isPhone, setIsPhone] = useState(true);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (isPhone) return <>{children}</>;

  return (
    <ReactLenis root options={options}>
      {children}
    </ReactLenis>
  );
}
