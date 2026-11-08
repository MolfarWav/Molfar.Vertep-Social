// The text the image model gets for a profile's portrait, built from what the profile says about itself.
// The user edits it in the picture dialog before anything is drawn.

const ABOUT_MAX = 600;
const PROMPT_MAX = 1200;

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

export function portraitPrompt(profile: { name: string; about: string; interests: string[] }): string {
  const about = cut(profile.about.replace(/\s+/g, " ").trim(), ABOUT_MAX);
  const interests = profile.interests.map((x) => x.trim()).filter(Boolean).slice(0, 6);
  const parts = [`A portrait of ${profile.name.trim() || "a character"}.`];
  if (about) parts.push(about.endsWith(".") || about.endsWith("…") ? about : about + ".");
  if (interests.length) parts.push(`Interests: ${interests.join(", ")}.`);
  parts.push("Head and shoulders, one person, centred, square composition, soft light, no text, no watermark.");
  return cut(parts.join(" "), PROMPT_MAX);
}
