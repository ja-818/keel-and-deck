import { StrictMode, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import App from "./App";
import "./styles/globals.css";
import { useUIStore } from "./stores/ui";
import { initFrontendLogging, logger } from "./lib/logger";

// Initialize file-based logging — patches console.error/warn to write to
// ~/Library/Application Support/houston/logs/frontend.log
initFrontendLogging();

// Global error handlers — surface ALL uncaught errors as toasts
// (console.error calls here also flow to the log file via initFrontendLogging)
window.onerror = (_event, _source, _line, _col, error) => {
  const message = error?.message ?? String(_event);
  console.error("[global:error]", message, error);
  useUIStore.getState().addToast({
    title: "Uncaught error",
    description: message,
  });
};

window.onunhandledrejection = (event: PromiseRejectionEvent) => {
  const message = event.reason?.message ?? String(event.reason);
  console.error("[global:unhandledrejection]", message, event.reason);
  useUIStore.getState().addToast({
    title: "Unhandled promise rejection",
    description: message,
  });
};

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    logger.error(`[react-crash] ${error.message}`, error.stack);
    useUIStore.getState().addToast({
      title: "React crash",
      description: error.message,
    });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
          <h1 style={{ color: "red" }}>App crashed</h1>
          <p>{this.state.error.message}</p>
          <pre>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
);
