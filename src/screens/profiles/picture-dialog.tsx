// "Profile picture": draws a portrait for the profile with one of the engine's image models. The prompt is built
// from the profile and can be edited; "Use this picture" puts the result in the draft (Save keeps it).
import { useEffect, useId, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { ModelPick } from "@/screens/settings/model-pick";
import { Pick } from "@/screens/settings/controls";
import { Dialog } from "./dialog";
import { generatePicture, imageOptions, listImageModels, type ImageModel } from "./picture-api";
import { portraitPrompt } from "./picture";

const MODEL_KEY = "social:image-model";
const readModel = (): string => {
  try {
    return localStorage.getItem(MODEL_KEY) ?? "";
  } catch {
    return "";
  }
};
const saveModel = (v: string) => {
  try {
    localStorage.setItem(MODEL_KEY, v);
  } catch {
    // a per-viewer convenience only
  }
};

export interface PictureDialogProps {
  name: string;
  hue: number;
  about: string;
  interests: string[];
  /** The picture the profile has now (the draft's), "" = none. */
  current: string;
  phone: boolean;
  onUse: (url: string) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function PictureDialog(p: PictureDialogProps) {
  const t = useT();
  const promptId = useId();
  const modelId = useId();
  const [prompt, setPrompt] = useState(() => portraitPrompt({ name: p.name, about: p.about, interests: p.interests }));
  const [models, setModels] = useState<ImageModel[]>([]);
  const [model, setModel] = useState(readModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState("");

  useEffect(() => {
    let live = true;
    void listImageModels().then((m) => {
      if (live) setModels(m);
    });
    return () => {
      live = false;
    };
  }, []);

  const draw = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setError("");
    try {
      setFresh(await generatePicture(prompt.trim(), model, p.hue));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const shown = fresh || p.current;
  const options = imageOptions(models, model, t("profiles.picture.engineDefault"));

  return (
    <Dialog title={t("profiles.picture.title", { name: p.name })} width={560} sheet={p.phone} onClose={p.onClose}>
      <div className="pf-body pic-body">
        <div className="pic-view" aria-live="polite">
          <Avatar name={p.name} hue={p.hue} size={p.phone ? 128 : 160} radius={12} picture={shown || undefined} />
          {busy && <div className="pic-busy"><span className="spin" /> {t("profiles.picture.drawing")}</div>}
        </div>
        <div className="f f-wide">
          <label htmlFor={promptId} className="lb">{t("profiles.picture.prompt")}</label>
          <textarea id={promptId} className="inp inp-area" rows={5} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div className="f f-wide">
          <span className="lb" id={modelId}>{t("profiles.picture.model")}</span>
          {PREVIEW ? (
            <Pick
              labelledBy={modelId}
              value={model}
              options={options}
              onChange={(v) => {
                setModel(v);
                saveModel(v);
              }}
            />
          ) : (
            <ModelPick
              labelledBy={modelId}
              value={model}
              options={options}
              onChange={(v) => {
                setModel(v);
                saveModel(v);
              }}
            />
          )}
        </div>
        {error && <div className="form-err" role="alert">{t("profiles.picture.failed", { error })}</div>}
        {fresh && <div className="k">{t("profiles.picture.keepHint")}</div>}
      </div>
      <div className="pf-foot">
        {p.current && !fresh && (
          <button type="button" className="btn" onClick={() => {
            p.onRemove();
            p.onClose();
          }}>{t("profiles.picture.remove")}</button>
        )}
        <span className="grow" />
        <button type="button" className="btn" onClick={p.onClose}>{t(fresh ? "profiles.picture.discard" : "profiles.picture.close")}</button>
        <button type="button" className={`btn${fresh ? "" : " cta"}`} onClick={() => void draw()} disabled={busy || !prompt.trim()}>
          {t(fresh ? "profiles.picture.again" : "profiles.picture.generate")}
        </button>
        {fresh && (
          <button type="button" className="btn cta" onClick={() => {
            p.onUse(fresh);
            p.onClose();
          }}>{t("profiles.picture.use")}</button>
        )}
      </div>
    </Dialog>
  );
}
