"use client";

import { useEffect, useState } from "react";

// localStorage + a same-tab custom event, mirroring ThemeToggle's exact
// pattern (khata-theme). localStorage alone doesn't notify other components
// in the SAME tab when it changes (the native `storage` event only fires in
// OTHER tabs) — the custom event is what makes every <Sensitive> on the page
// update the instant the Settings switch is flipped, with no Context
// Provider needed anywhere in the tree.
const KEY = "khata-hide-balances";
const EVENT = "khata-hide-balances-changed";

function readStored(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}

export function useHideBalances(): [boolean, () => void] {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setHidden(readStored());
    const onChange = () => setHidden(readStored());
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  function toggle() {
    const next = !readStored();
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      /* private mode — toggle still works for this session, just won't persist */
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return [hidden, toggle];
}
