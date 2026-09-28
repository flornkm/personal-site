import { generateText } from "ai";

// Written for a personal running feed, so the voice rules mirror src/writing: plain,
// personal, no em dashes, no AI-tell phrasing.
const SYSTEM = `You write one-line diary notes about runs for Florian's personal website running feed.
Rules:
- One short sentence, roughly 15 to 25 words. Never more than two sentences, never line breaks.
- First person, past tense, casual, like a quick note to self.
- Stick strictly to the data. Never describe how the body, legs, or run felt, and never invent effort, mood, events, places, or people. Calling a number high, low, or a stretch hot is fine because the data shows it.
- The start time tells you the time of day. Only reference a time of day that matches it (a 19:00 start is an evening run, never a morning one), or leave it unmentioned. When you mention the clock time, use 12-hour format like 9:30pm.
- Pick the two or three most notable facts, not all of them. Round numbers naturally.
- Never use em dashes or en dashes. No exclamation marks, no emoji.
- Output only the note, no preamble, no quotes.`;

export type RunFacts = {
  startDate: string;
  sportType: string;
  indoor: boolean;
  distanceMeters: number;
  movingSeconds: number;
  averageHeartRate: number | null;
  temperature: number | null;
};

function paceMinPerKm(distanceMeters: number, movingSeconds: number): string | null {
  if (distanceMeters < 100 || movingSeconds <= 0) return null;
  const secPerKm = movingSeconds / (distanceMeters / 1000);
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")} min/km`;
}

// A short diary-style note about a run, generated once per run at sync time via the
// Vercel AI Gateway (claude-sonnet-5). `recentNotes` carries the latest existing notes so
// consecutive entries don't share openings or phrasing — without it, similar runs (a hot
// streak, a repeated 5k loop) converge on near-identical text. Returns null when no
// gateway key is configured or the request fails — the sync must never break because of
// the describer, and null retries on the next sync.
export async function generateRunDescription(
  run: RunFacts,
  recentNotes: string[] = [],
): Promise<string | null> {
  if (!process.env.AI_GATEWAY_API_KEY) return null;

  const facts = [
    `date: ${run.startDate.slice(0, 10)}`,
    `start time (local): ${run.startDate.slice(11, 16)}`,
    `type: ${run.indoor ? "treadmill run (indoors)" : run.sportType}`,
    `distance: ${(run.distanceMeters / 1000).toFixed(1)} km`,
    `moving time: ${Math.round(run.movingSeconds / 60)} min`,
    `pace: ${paceMinPerKm(run.distanceMeters, run.movingSeconds) ?? "unknown"}`,
    `average heart rate: ${run.averageHeartRate == null ? "not recorded" : `${Math.round(run.averageHeartRate)} bpm`}`,
    run.indoor
      ? null
      : `temperature at start: ${run.temperature == null ? "unknown" : `${Math.round(run.temperature)}°C`}`,
  ]
    .filter(Boolean)
    .join("\n");

  const variety = recentNotes.length
    ? `\n\nNotes from the previous runs, newest first. Write this one with a clearly different opening and structure, and don't reuse their phrases:\n${recentNotes
        .slice(0, 3)
        .map((note) => `- ${note}`)
        .join("\n")}`
    : "";

  try {
    const { text } = await generateText({
      model: "anthropic/claude-sonnet-5",
      system: SYSTEM,
      prompt: `Describe this run:\n${facts}${variety}`,
    });

    const trimmed = text.trim();
    if (!trimmed) return null;

    // Belt and suspenders on the no-dash and no-newline rules.
    return (
      trimmed
        .replaceAll("—", "-")
        .replaceAll("–", "-")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" ") || null
    );
  } catch (error) {
    console.error("Run description generation failed:", error);
    return null;
  }
}
