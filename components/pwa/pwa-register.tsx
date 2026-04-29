"use client";

import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const canRegister =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!canRegister) {
      return;
    }

    // Registrera sent så första render/auth/API-flöden inte blockeras av PWA-lagret.
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          // Tvinga en snabb kontroll så installerad app inte ligger kvar på äldre JS-buntar.
          void registration.update();
        })
        .catch((error) => {
          console.warn("Service worker kunde inte registreras:", error);
        });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }

    window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
