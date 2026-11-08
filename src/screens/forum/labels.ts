import { currentLang, type Lang } from "@/i18n/index";

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Ukrainian needs three forms for a count (1 тема, 2 теми, 5 тем); English needs two. */
export function pluralForm(n: number, lang: Lang): "one" | "few" | "many" {
  if (lang === "en") return n === 1 ? "one" : "many";
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "one";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "few";
  return "many";
}

/** "14 тем", "2 теми", "1 тема": the count and its noun in the right form. */
export function countLabel(t: Translate, kind: "posts" | "topics", n: number): string {
  return t(`forum.${kind}.${pluralForm(n, currentLang())}`, { n });
}
