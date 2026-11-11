// "Манера письма": how the profile writes. The preview shows one sample line
// in the chosen voice; it is a mock, not a model call.
import { useT } from "@/i18n/index";
import { ProfilePacks } from "@/stickers/ProfilePacks";
import { AddChip, Chip, Field, Seg, Slider, withItem } from "../ui";
import { SectionPage } from "../sections";
import { WORDS_MAX, WordsInvent } from "./WordsInvent";
import type { TabProps } from "./types";

export function VoiceTab({ form, set, name, profileId }: TabProps) {
  const t = useT();
  const v = form.voice;
  const setVoice = (patch: Partial<typeof v>) => set({ voice: { ...v, ...patch } });
  const words = v.words ?? [];

  return (
    <SectionPage
      tab="voice"
      label={t("profiles.sec.menu")}
      sections={[
        {
          id: "voice",
          title: t("profiles.voice.voice"),
          icon: "mic",
          tone: "violet",
          children: (
            <Field label={t("profiles.voice.voice")} wide>
              {(id) => (
                <textarea id={id} className="inp inp-area inp-tall" rows={2} value={v.text} onChange={(e) => setVoice({ text: e.target.value })} />
              )}
            </Field>
          ),
        },
        {
          id: "style",
          title: t("profiles.sec.voiceStyle"),
          icon: "chat",
          tone: "sky",
          children: (
            <div className="fields-row">
              <Field label={t("profiles.voice.length")}>
                {() => (
                  <Seg
                    label={t("profiles.voice.length")}
                    value={v.length}
                    onChange={(length) => setVoice({ length })}
                    options={[
                      { value: 0, label: t("profiles.voice.short") },
                      { value: 1, label: t("profiles.voice.medium") },
                      { value: 2, label: t("profiles.voice.long") },
                    ]}
                  />
                )}
              </Field>
              <Field label={t("profiles.voice.emoji")}>
                {() => (
                  <Seg
                    label={t("profiles.voice.emoji")}
                    value={v.emoji}
                    onChange={(emoji) => setVoice({ emoji })}
                    options={[
                      { value: 0, label: t("profiles.voice.never") },
                      { value: 1, label: t("profiles.voice.sometimes") },
                      { value: 2, label: t("profiles.voice.often") },
                    ]}
                  />
                )}
              </Field>
              <div className="f f-grow">
                <span className="lb">{t("profiles.voice.formality")}</span>
                <Slider
                  label={t("profiles.voice.formality")}
                  value={v.formality}
                  onChange={(formality) => setVoice({ formality })}
                  left={t("profiles.voice.informal")}
                  right={t("profiles.voice.formal")}
                />
              </div>
            </div>
          ),
        },
        {
          id: "know",
          title: t("profiles.voice.knows"),
          icon: "user",
          tone: "rose",
          children: (
            <Field label={t("profiles.voice.knows")} wide>
              {() => (
                <Seg
                  label={t("profiles.voice.knows")}
                  value={form.knows ?? ""}
                  onChange={(knows) => set({ knows })}
                  options={[
                    { value: "", label: t("profiles.voice.knows.default") },
                    { value: "knows", label: t("profiles.voice.knows.knows") },
                    { value: "name", label: t("profiles.voice.knows.name") },
                    { value: "stranger", label: t("profiles.voice.knows.stranger") },
                  ]}
                />
              )}
            </Field>
          ),
        },
        {
          id: "words",
          title: t("profiles.sec.words"),
          icon: "tag",
          tone: "amber",
          children: (
            <>
              <div className="f">
                <span className="lb">{t("profiles.voice.words")}</span>
                <div className="chips">
                  {words.map((x) => (
                    <Chip key={x} hued={x} onRemove={() => setVoice({ words: words.filter((y) => y !== x) })} removeLabel={t("profiles.chip.remove", { name: x })}>{x}</Chip>
                  ))}
                  {words.length < WORDS_MAX && <AddChip label={t("profiles.about.addChip")} inputLabel={t("profiles.chip.new")} onAdd={(x) => setVoice({ words: withItem(words, x.slice(0, 40), WORDS_MAX) })} />}
                </div>
                <WordsInvent name={name} profileId={profileId} have={words} onAdd={(add) => setVoice({ words: add.reduce((acc, w) => withItem(acc, w.slice(0, 40), WORDS_MAX), words) })} />
                <p className="k">{t("profiles.voice.wordsHint")}</p>
              </div>
              <div className="f">
                <span className="lb">{t("profiles.voice.neverWrites")}</span>
                <div className="chips">
                  {v.never.map((x) => (
                    <Chip key={x} onRemove={() => setVoice({ never: v.never.filter((y) => y !== x) })} removeLabel={t("profiles.chip.remove", { name: x })}>{x}</Chip>
                  ))}
                  <AddChip label={t("profiles.about.addChip")} inputLabel={t("profiles.chip.new")} onAdd={(x) => setVoice({ never: withItem(v.never, x) })} />
                </div>
              </div>
            </>
          ),
        },
        {
          id: "packs",
          title: t("stk.profile.title"),
          icon: "img",
          tone: "teal",
          children: <ProfilePacks value={form.stickerPacks ?? []} onChange={(stickerPacks) => set({ stickerPacks })} />,
        },
        {
          id: "prev",
          title: t("profiles.voice.preview"),
          icon: "eye",
          tone: "emerald",
          children: (
            <div className="pv">
              <div className="log">
                <div>
                  <span className="n" style={{ color: "var(--acct)" }}>{name}</span> <span className="k">20:41</span>
                </div>
                <div>Доброго вечора. Я сиділа біля очерету… і чула, як тин упав.</div>
                <button type="button" className="btn btn-inline">{t("profiles.voice.check")}</button>
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
