
  import { StrictMode } from "react";
  import { createRoot } from "react-dom/client";
  import { AppProvider } from "./app/store.tsx";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppProvider>
        <App />
      </AppProvider>
    </StrictMode>
  );
  