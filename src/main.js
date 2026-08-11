import { App } from "./App.js";

window.addEventListener("error", (e) => {
  showBootError(e.error || e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  showBootError(e.reason);
});

function showBootError(err) {
  const msg = err && err.stack ? err.stack : String(err);
  console.error(err);
  let el = document.getElementById("boot-error");
  if (!el) {
    el = document.createElement("pre");
    el.id = "boot-error";
    el.style.cssText =
      "position:fixed;left:12px;bottom:28px;right:12px;max-height:40vh;overflow:auto;background:#2a1010;color:#ffb4b4;padding:10px;border:1px solid #611;z-index:99;font:11px/1.4 ui-monospace,monospace;white-space:pre-wrap";
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

try {
  const app = new App();
  window.flare = app;
} catch (err) {
  showBootError(err);
}
