"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { SenderEngine, type SenderEngineState } from "./engine";
import {
  getEngine,
  getSelectedFiles,
  setSelectedFiles,
} from "@/lib/files/client-store";

/** Create a fresh engine for the /send page. */
export function useSenderCreation() {
  const [engine] = useState(() => new SenderEngine());
  const state = useSyncExternalStore(
    engine.subscribe,
    engine.getState,
    engine.getState,
  );

  const createTransfer = useCallback(
    async (password: string | null): Promise<{ roomId: string; shareUrl: string } | null> => {
      const files = getSelectedFiles();
      try {
        const result = await engine.createTransfer({ files, password });
        return result;
      } catch {
        return null;
      }
    },
    [engine],
  );

  return { state, createTransfer };
}

/** Look up an existing engine (created on /send, keyed by room ID). */
export function useExistingSenderEngine(roomId: string): {
  engine: SenderEngine | null;
  state: SenderEngineState | null;
} {
  const engine = getEngine<SenderEngine>(roomId) ?? null;
  const state = useSyncExternalStore(
    engine?.subscribe ?? noopSubscribe,
    engine?.getState ?? noopGetState,
    engine?.getState ?? noopGetState,
  );
  return { engine, state };
}

/** Clear the selected-file queue. */
export function clearQueue(): void {
  setSelectedFiles([]);
}

const noopSubscribe = () => () => undefined;
const noopGetState = () => null;
