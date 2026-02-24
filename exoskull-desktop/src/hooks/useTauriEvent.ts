import { useEffect, useState } from "react";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export function useTauriEvent<T>(eventName: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;

    listen<T>(eventName, (event) => {
      setValue(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [eventName]);

  return value;
}
