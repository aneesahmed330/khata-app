"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }): void;
          renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/** Google Identity Services' own button, not a styled <button> of ours —
 *  Google requires its logo/wordmark be rendered by their script, not
 *  recreated, so this loads their script once and hands it a div to fill. */
export function GoogleSignInButton() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) return;

    function render() {
      if (!containerRef.current || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: async (response) => {
          const res = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ idToken: response.credential }),
          });
          if (res.ok) window.location.href = "/";
        },
      });
      window.google.accounts.id.renderButton(containerRef.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        width: containerRef.current.clientWidth,
      });
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      if (window.google) render();
      else existing.addEventListener("load", render);
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, []);

  return <div ref={containerRef} className="w-full" />;
}
