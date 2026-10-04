import {
  alwaysShowTranslationsFor,
  parseConfigView,
  type ConfigView,
  type ScenarioView,
} from "./config.js";
import { mountConversation } from "./conversation.js";
import { renderBackend } from "./header.js";

// NFR-001: every piece of text goes through textContent, never innerHTML.

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing #${id} in index.html`);
  }
  return element;
}

function textElement(tag: string, className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

function startScene(scenario: ScenarioView, config: ConfigView): void {
  requireElement("scene-picker").hidden = true;
  mountConversation({
    root: document,
    scenario,
    fetchFn: fetch.bind(window),
    alwaysShowTranslations: alwaysShowTranslationsFor(config.backend),
  }).start();
}

function scenarioItem(scenario: ScenarioView, config: ConfigView): HTMLLIElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "scenario";
  button.dataset.scenarioId = scenario.id;
  button.append(
    textElement("span", "scenario-title", scenario.title),
    textElement("span", "scenario-goal", `Your goal: ${scenario.goal}`),
    textElement("span", "scenario-role", `Gemma plays: ${scenario.role}`),
  );
  button.addEventListener("click", () => startScene(scenario, config));
  item.append(button);
  return item;
}

async function start(): Promise<void> {
  const status = requireElement("status");
  const list = requireElement("scenarios");

  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error(`/api/config answered ${response.status}`);
    }
    const config = parseConfigView(await response.json());
    renderBackend(document, config);
    list.replaceChildren(...config.scenarios.map((scenario) => scenarioItem(scenario, config)));
    status.textContent = "";
    status.hidden = true;
  } catch (error) {
    status.textContent = "Couldn't load the scenes. Is the HanashiGemma server running?";
    console.error(error);
  }
}

void start();
