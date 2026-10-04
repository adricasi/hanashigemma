export interface Scenario {
  id: string;
  title: string;
  /** What the learner tries to achieve, in one line. */
  goal: string;
  /** Who Gemma plays. */
  role: string;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "shinjuku-ticket",
    title: "Buying a train ticket at Shinjuku",
    goal: "Buy a one-way ticket to Kamakura and find out which platform the train leaves from.",
    role: "Ticket office clerk at JR Shinjuku Station",
  },
  {
    id: "izakaya-ramen",
    title: "Ordering ramen at an izakaya",
    goal: "Order a bowl of ramen and a drink, then ask for the bill.",
    role: "Server at a small neighbourhood izakaya",
  },
  {
    id: "kyoto-directions",
    title: "Asking for directions in Kyoto",
    goal: "Find out how to get to Kiyomizu-dera from where you are standing.",
    role: "Friendly local passer-by near Kyoto Station",
  },
];
