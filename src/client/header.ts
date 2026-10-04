import { backendLabel, type ConfigView } from "./config.js";

// NFR-001: text only, never innerHTML.

/** AC-010.5 badge, plus the hosted-mode privacy notice (design.md, Security design). */
export function renderBackend(root: Document, config: ConfigView): void {
  const badge = root.getElementById("backend-badge");
  if (badge !== null) {
    badge.textContent = backendLabel(config.backend, config.model);
  }
  const notice = root.getElementById("hosted-notice");
  if (notice !== null) {
    // Local mode keeps everything on the learner's computer; hosted mode sends it to Google.
    notice.hidden = config.backend !== "gemini";
  }
}
