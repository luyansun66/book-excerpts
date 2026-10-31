
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

  // Service Worker 只在生产环境注册。
  //
  // 开发预览（尤其手机通过局域网 IP 打开）一旦注册过 SW，旧缓存会继续喂页面，
  // 改完代码刷新也看不到 —— 端口不同还会各留一份。所以 dev 下主动注销旧注册、
  // 清掉它的缓存；如果当前页面仍被旧 SW 控制，重载一次让页面脱离 controller。
  if ("serviceWorker" in navigator) {
    if (import.meta.env.PROD) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").then(
          (reg) => console.log("SW registered:", reg.scope),
          (err) => console.warn("SW registration failed:", err),
        );
      });
    } else {
      void (async () => {
        const hadController = Boolean(navigator.serviceWorker.controller);
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
        await Promise.all(regs.map((reg) => reg.unregister().catch(() => false)));
        if (typeof caches !== "undefined") {
          const keys = await caches.keys().catch(() => []);
          await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
        }
        if (hadController && !sessionStorage.getItem("dev-sw-cleared")) {
          sessionStorage.setItem("dev-sw-cleared", "1");
          location.reload();
        }
      })();
    }
  }

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
  
