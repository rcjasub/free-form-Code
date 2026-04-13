import { useEffect } from "react";
import { DotLottie } from "@lottiefiles/dotlottie-web";

export function useLottieFavicon(src: string) {
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;

    let rafId: number;
    let lastUpdate = 0;
    const INTERVAL = 1000 / 24; // 24fps is plenty for a favicon

    const dotLottie = new DotLottie({
      canvas,
      src,
      loop: true,
      autoplay: true,
    });

    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }

    function tick(timestamp: number) {
      if (timestamp - lastUpdate >= INTERVAL) {
        link!.href = canvas.toDataURL("image/png");
        lastUpdate = timestamp;
      }
      rafId = requestAnimationFrame(tick);
    }

    dotLottie.addEventListener("ready", () => {
      rafId = requestAnimationFrame(tick);
    });

    return () => {
      cancelAnimationFrame(rafId);
      dotLottie.destroy();
    };
  }, [src]);
}
