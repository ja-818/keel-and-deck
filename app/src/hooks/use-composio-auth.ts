import { useState, useCallback, useRef, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { tauriConnections } from "../lib/tauri";

export interface ComposioAuthState {
  open: boolean;
  authUrl: string | null;
  error: string | null;
  pasteExpanded: boolean;
  pasteValue: string;
  submitting: boolean;
}

export function useComposioAuth(onSuccess: () => void) {
  const [state, setState] = useState<ComposioAuthState>({
    open: false,
    authUrl: null,
    error: null,
    pasteExpanded: false,
    pasteValue: "",
    submitting: false,
  });
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { unlistenRef.current?.(); };
  }, []);

  const startAuth = useCallback(async () => {
    setState({
      open: true, authUrl: null, error: null,
      pasteExpanded: false, pasteValue: "", submitting: false,
    });

    unlistenRef.current?.();
    unlistenRef.current = await listen<{ success: boolean; error?: string }>(
      "composio-auth-result",
      (event) => {
        if (event.payload.success) {
          setState((s) => ({ ...s, open: false }));
          onSuccess();
        } else {
          setState((s) => ({ ...s, error: event.payload.error ?? "Authentication failed" }));
        }
        unlistenRef.current?.();
        unlistenRef.current = null;
      },
    );

    try {
      const { auth_url } = await tauriConnections.startOAuth();
      setState((s) => ({ ...s, authUrl: auth_url }));
    } catch (e) {
      console.error("[connections] OAuth start failed:", e);
      setState((s) => ({ ...s, error: String(e) }));
    }
  }, [onSuccess]);

  const reopen = useCallback(async () => {
    try { await tauriConnections.reopenOAuth(); }
    catch (e) { console.error("[connections] Reopen failed:", e); }
  }, []);

  const togglePaste = useCallback(() => {
    setState((s) => ({ ...s, pasteExpanded: !s.pasteExpanded }));
  }, []);

  const setPasteValue = useCallback((value: string) => {
    setState((s) => ({ ...s, pasteValue: value }));
  }, []);

  const submitPaste = useCallback(async () => {
    const url = state.pasteValue.trim();
    if (!url) return;
    setState((s) => ({ ...s, submitting: true, error: null }));
    try {
      await tauriConnections.submitCallback(url);
      setState((s) => ({ ...s, open: false }));
      onSuccess();
    } catch (e) {
      setState((s) => ({ ...s, error: String(e), submitting: false }));
    }
  }, [state.pasteValue, onSuccess]);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
    unlistenRef.current?.();
    unlistenRef.current = null;
  }, []);

  return { state, startAuth, reopen, togglePaste, setPasteValue, submitPaste, close };
}
