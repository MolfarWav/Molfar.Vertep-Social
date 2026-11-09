// Settings > Pictures (issue MolfarWav/Molfar.Vertep#331). Whether characters may send drawn pictures in the messenger and on the forum
// (off by default: every picture is a call to an image model), how many a day each, and the image model. A character can override
// the model on its own page (Profiles > Model). The user's own pictures (from disk, or drawn on request) need none of this.
import { useEffect, useState } from "react";
import { useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { LIMITS, type SettingsMock } from "@/mock/settings";
import { imageOptions, listImageModels, type ImageModel } from "@/screens/profiles/picture-api";
import { Pick, Row, Stepper, Switch } from "./controls";
import { ModelPick } from "./model-pick";
import type { Patch } from "./parts";

export function PicturesRows({ s, set, phone = false }: { s: SettingsMock; set: Patch; phone?: boolean }) {
  const t = useT();
  const [models, setModels] = useState<ImageModel[]>([]);
  useEffect(() => {
    let live = true;
    void listImageModels().then((m) => {
      if (live) setModels(m);
    });
    return () => {
      live = false;
    };
  }, []);
  const on = s.images.on;
  const options = imageOptions(models, s.models.image, t("settings.model.engineDefault"));
  return (
    <>
      <Row title={t("settings.pictures.on")} hint={t(phone ? "settings.pictures.on.phone.hint" : "settings.pictures.on.hint")}>
        {(id) => <Switch labelledBy={id} checked={on} onChange={(v) => set({ images: { ...s.images, on: v } })} />}
      </Row>
      <div className={`pictures-more${on ? "" : " is-off"}`} aria-disabled={!on || undefined}>
        <Row title={t("settings.pictures.limit")} hint={phone ? undefined : t("settings.pictures.limit.hint")}>
          {() => (
            <Stepper
              name={t("settings.pictures.limit")}
              value={s.images.perDay}
              min={LIMITS.imagesPerDay.min}
              max={LIMITS.imagesPerDay.max}
              onChange={(v) => set({ images: { ...s.images, perDay: v } })}
            />
          )}
        </Row>
        <Row title={t("settings.pictures.model")} hint={phone ? undefined : t("settings.pictures.model.hint")}>
          {(id) =>
            PREVIEW ? (
              <Pick labelledBy={id} value={s.models.image} options={options} onChange={(v) => set({ models: { ...s.models, image: v } })} />
            ) : (
              <ModelPick labelledBy={id} value={s.models.image} options={options} onChange={(v) => set({ models: { ...s.models, image: v } })} />
            )
          }
        </Row>
      </div>
    </>
  );
}
