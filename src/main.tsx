
  import { StrictMode } from "react";
  import { createRoot } from "react-dom/client";
  import { AppProvider } from "./app/store.tsx";
  import { ReadingTimerProvider } from "./app/components/timer/ReadingTimerProvider.tsx";
  import { MailboxProvider } from "./app/mailbox/MailboxProvider.tsx";
  import { ReviewProvider } from "./app/review/ReviewProvider.tsx";
  import App from "./app/App.tsx";
  import ErrorBoundary from "./app/components/ErrorBoundary.tsx";
  import "./styles/index.css";

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
  
