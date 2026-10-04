// Mirrors the /api/config response built in src/server/app.ts; the browser build can't
// import the server modules, so keep both sides in step.
export type Backend = "ollama" | "gemini";

export interface ScenarioView {
  id: string;
  title: string;
  goal: string;
  role: string;
}

export interface ConfigView {
  backend: Backend;
  model: string;
  scenarios: ScenarioView[];
}

const BACKEND_NAMES: Record<Backend, string> = {
  ollama: "local (Ollama)",
  gemini: "hosted (Gemini API)",
};

/** AC-010.5: the badge text, e.g. "Gemma · local (Ollama) · gemma4:e4b". */
export function backendLabel(backend: Backend, model: string): string {
  return `Gemma · ${BACKEND_NAMES[backend]} · ${model}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isScenarioView(value: unknown): value is ScenarioView {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.goal === "string" &&
    typeof value.role === "string"
  );
}

export function parseConfigView(value: unknown): ConfigView {
  if (
    isRecord(value) &&
    (value.backend === "ollama" || value.backend === "gemini") &&
    typeof value.model === "string" &&
    Array.isArray(value.scenarios) &&
    value.scenarios.every(isScenarioView)
  ) {
    return { backend: value.backend, model: value.model, scenarios: value.scenarios };
  }
  throw new Error("Unexpected /api/config response");
}
