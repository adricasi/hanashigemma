/** What the browser sees of a scenario (GET /api/config). */
export interface PublicScenario {
  id: string;
  title: string;
  /** What the learner tries to achieve, in one line. */
  goal: string;
  /** Who Gemma plays. */
  role: string;
}

export interface Scenario extends PublicScenario {
  /** Prompt-only: how Gemma opens the scene (AC-001.2). */
  opening: string;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "shinjuku-ticket",
    title: "Buying a train ticket at Shinjuku",
    goal: "Buy a one-way ticket to Kamakura and find out which platform the train leaves from.",
    role: "Ticket office clerk at JR Shinjuku Station",
    opening:
      "The learner has just stepped up to your ticket counter. Greet them and ask how you can help.",
  },
  {
    id: "izakaya-ramen",
    title: "Ordering ramen at an izakaya",
    goal: "Order a bowl of ramen and a drink, then ask for the bill.",
    role: "Server at a small neighbourhood izakaya",
    opening:
      "The learner has just come into the izakaya and sat down. Welcome them and offer to take their order.",
  },
  {
    id: "kyoto-directions",
    title: "Asking for directions in Kyoto",
    goal: "Find out how to get to Kiyomizu-dera from where you are standing.",
    role: "Friendly local passer-by near Kyoto Station",
    opening:
      "The learner, a tourist, has just politely stopped you on the street. Answer kindly and ask what they need.",
  },
];

export function publicScenario({ id, title, goal, role }: Scenario): PublicScenario {
  return { id, title, goal, role };
}
