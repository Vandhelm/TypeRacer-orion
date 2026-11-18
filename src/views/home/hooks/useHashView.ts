import { useSyncExternalStore } from "react";
import type { View } from "../scene/createScene";

const read = (): View => (location.hash === "#rooms" ? "rooms" : "home");
const subscribe = (onChange: () => void) => {
  addEventListener("hashchange", onChange);
  return () => removeEventListener("hashchange", onChange);
};

/** Current view from the URL: #rooms → "rooms", anything else → "home". */
export function useHashView(): View {
  return useSyncExternalStore(subscribe, read, () => "home");
}
