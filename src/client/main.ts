import { backendLabel, parseConfigView, type ScenarioView } from "./config.js";
import { mountConversation } from "./conversation.js";

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

function startScene(scenario: ScenarioView): void {
  requireElement("scene-picker").hidden = true;
  mountConversation({ root: document, scenario, fetchFn: fetch.bind(window) }).start();
}

function scenarioItem(scenario: ScenarioView): HTMLLIElement {
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
  button.addEventListener("click", () => startScene(scenario));
  item.append(button);
  return item;
}

async function start(): Promise<void> {
  const status = requireElement("status");
  const badge = requireElement("backend-badge");
  const list = requireElement("scenarios");

  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error(`/api/config answered ${response.status}`);
    }
    const config = parseConfigView(await response.json());
    badge.textContent = backendLabel(config.backend, config.model);
    list.replaceChildren(...config.scenarios.map(scenarioItem));
    status.textContent = "";
    status.hidden = true;
  } catch (error) {
    status.textContent = "Couldn't load the scenes. Is the HanashiGemma server running?";
    console.error(error);
  }
}

void start();
