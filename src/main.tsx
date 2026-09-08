
  import { StrictMode } from "react";
  import { createRoot } from "react-dom/client";
  import { AppProvider } from "./app/store.tsx";
  import { ReadingTimerProvider } from "./app/components/timer/ReadingTimerProvider.tsx";
  import App from "./app/App.tsx";
  import ErrorBoundary from "./app/components/ErrorBoundary.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <AppProvider>
          <ReadingTimerProvider>
            <App />
          </ReadingTimerProvider>
        </AppProvider>
      </ErrorBoundary>
    </StrictMode>
  );
  
