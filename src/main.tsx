
  import { StrictMode } from "react";
  import { createRoot } from "react-dom/client";
  import { AppProvider } from "./app/store.tsx";
  import { ReadingTimerProvider } from "./app/components/timer/ReadingTimerProvider.tsx";
  import { MailboxProvider } from "./app/mailbox/MailboxProvider.tsx";
  import { ReviewProvider } from "./app/review/ReviewProvider.tsx";
  import App from "./app/App.tsx";
  import ErrorBoundary from "./app/components/ErrorBoundary.tsx";
  import { clearLegacyOcrToken } from "./app/legacyStorage.ts";
  import "./styles/index.css";

  // 撤掉客户端缓存的 OCR 票之后，把老版本写进浏览器的票删掉（一次性，2026-11 后可删）
  clearLegacyOcrToken();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <AppProvider>
          <ReadingTimerProvider>
            <MailboxProvider>
              <ReviewProvider>
                <App />
              </ReviewProvider>
            </MailboxProvider>
          </ReadingTimerProvider>
        </AppProvider>
      </ErrorBoundary>
    </StrictMode>
  );
  
