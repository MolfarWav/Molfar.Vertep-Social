// "Модель": the model that writes as this profile. Empty means the app's models (Settings > Models);
// a pick here is for this profile alone, in the messenger and on the forum.
import { useT } from "@/i18n/index";
import { PREVIEW, type ModelChoice } from "@/lib/api";
import { useModelChoices } from "@/lib/use-models";
import { MODEL_IDS } from "@/mock/settings";
import { Pick } from "@/screens/settings/controls";
import { imageOptions, listImageModels, type ImageModel } from "../picture-api";
import { useEffect, useState } from "react";
import { ModelPick } from "@/screens/settings/model-pick";
import { modelOptions } from "@/screens/settings/real";
import { Field } from "../ui";
import type { TabProps } from "./types";

/** Preview only: `?picker=1` draws the searchable picker the installed app uses, over a few mock models. */
const MOCK_CHOICES: ModelChoice[] = [
  { ref: "openrouter/mistral-small-free", label: "Mistral Small (free)", provider: "OpenRouter" },
  { ref: "openrouter/llama-3.3-70b", label: "Llama 3.3 70B", provider: "OpenRouter" },
  { ref: "nanogpt/glm-4.6", label: "GLM 4.6", provider: "NanoGPT" },
  { ref: "local/qwen3-8b", label: "Qwen3 8B", provider: "Local server" },
];
const previewPicker = (): boolean => {
  try {
    return PREVIEW && new URLSearchParams(location.search).get("picker") === "1";
  } catch {
    return false;
  }
};

export function ModelTab({ form, set, name }: TabProps) {
  const t = useT();
  const live = useModelChoices();
  const searchable = !PREVIEW || previewPicker();
  const choices = PREVIEW ? MOCK_CHOICES : live;
  const own = form.model;
  const [imageModels, setImageModels] = useState<ImageModel[]>([]);
  useEffect(() => {
    let on = true;
    void listImageModels().then((m) => on && setImageModels(m));
    return () => {
      on = false;
    };
  }, []);
  const imageOwn = form.imageModel;
  const imageOpts = imageOptions(imageModels, imageOwn, t("profiles.model.imageApp"));
  const appLabel = t("profiles.model.app");
  const previewOptions = [{ value: "", label: appLabel }, ...MODEL_IDS.filter((id) => id !== "default").map((id) => ({ value: id, label: t(`settings.model.${id}`) }))];

  return (
    <div className="tab-stack tab-model">
      <Field label={t("profiles.model.label")} wide>
        {(id) =>
          !searchable ? (
            <Pick labelledBy={id} value={own} options={previewOptions} onChange={(model) => set({ model })} />
          ) : (
            <ModelPick labelledBy={id} value={own} options={modelOptions(choices, own, appLabel)} onChange={(model) => set({ model })} />
          )
        }
      </Field>
      <div className="k hint">{own ? t("profiles.model.hintOwn", { name }) : t("profiles.model.hintApp", { name })}</div>
      <div className="k hint">{t("profiles.model.scope")}</div>
      <Field label={t("profiles.model.imageLabel")} wide>
        {(id) =>
          !searchable ? (
            <Pick labelledBy={id} value={imageOwn} options={imageOpts} onChange={(imageModel) => set({ imageModel })} />
          ) : (
            <ModelPick labelledBy={id} value={imageOwn} options={imageOpts} onChange={(imageModel) => set({ imageModel })} />
          )
        }
      </Field>
      <div className="k hint">{t("profiles.model.imageHint", { name })}</div>
    </div>
  );
}
