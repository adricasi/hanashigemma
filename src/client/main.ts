import { backendLabel, parseConfigView, type ScenarioView } from "./config.js";

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

function scenarioItem(scenario: ScenarioView): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "scenario";
  item.dataset.scenarioId = scenario.id;
  item.append(
    textElement("h3", "scenario-title", scenario.title),
    textElement("p", "scenario-goal", `Your goal: ${scenario.goal}`),
    textElement("p", "scenario-role", `Gemma plays: ${scenario.role}`),
  );
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
