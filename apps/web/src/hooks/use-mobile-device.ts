import { useEffect, useState } from "react";

function detectMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const mobileUa =
    /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const coarseSmallScreen =
    window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 900;
  return mobileUa || coarseSmallScreen;
}

export function useMobileDevice(): boolean {
  const [isMobile, setIsMobile] = useState(() => detectMobileDevice());

  useEffect(() => {
    const update = () => setIsMobile(detectMobileDevice());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return isMobile;
}
