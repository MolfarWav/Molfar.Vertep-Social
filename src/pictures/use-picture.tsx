// The picture a user attaches to a message or a post: `usePicture` gives a text box its attach button, a chip that shows the
// attached picture (with a remove button) and the dialog the button opens. The dialog takes a file from disk or draws one with
// an engine image model (the same route the profile picture dialog uses); both end as a stored asset URL.
//
//   const pic = usePicture({ phone });
//   ... {pic.button} ... {pic.chip} ... {pic.dialog}
//   on send: pic.attached ({url, alt, gen}) goes into the request, then pic.clear()
import { useEffect, useId, useState, type ReactNode } from "react";
import { useT } from "@/i18n/index";
import { PREVIEW } from "@/lib/api";
import { Dialog } from "@/screens/profiles/dialog";
import { generatePicture, imageOptions, listImageModels, PICTURE_MAX_BYTES, PICTURE_TYPES, uploadPicture, type ImageModel } from "@/screens/profiles/picture-api";
import { Pick } from "@/screens/settings/controls";
import { ModelPick } from "@/screens/settings/model-pick";
import "./pictures.css";

export interface Attached {
  url: string;
  alt: string;
  /** Drawn by a model (the user asked for it), not a file from disk. */
  gen: boolean;
  /** "pack/item" when it is a sticker from a pack (issue #329): shown large, as a whole message. */
  sticker?: string;
}

/** The picture as a request carries it. */
export const imageBody = (a: Attached) => ({ url: a.url, alt: a.alt, gen: a.gen, ...(a.sticker ? { sticker: a.sticker } : {}) });
/** The picture as a message shows it before the answer comes back. */
export const imageShown = (a: Attached) => ({ state: "ready" as const, url: a.url, alt: a.alt, ...(a.gen ? { gen: true } : {}), ...(a.sticker ? { sticker: a.sticker } : {}) });

const MODEL_KEY = "social:image-model";
const readModel = (): string => {
  try {
    return localStorage.getItem(MODEL_KEY) ?? "";
  } catch {
    return "";
  }
};

function ClipIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17l5-5 4 4 3-3 4 4" />
    </svg>
  );
}

export function usePicture({ phone }: { phone: boolean }): { attached: Attached | null; button: ReactNode; chip: ReactNode; dialog: ReactNode; clear: () => void } {
  const t = useT();
  const [attached, setAttached] = useState<Attached | null>(null);
  const [open, setOpen] = useState(false);
  const button = (
    <button type="button" className="at-btn" aria-label={t("pic.attach")} title={t("pic.attach")} onClick={() => setOpen(true)}>
      <ClipIcon />
    </button>
  );
  const chip = attached ? (
    <div className="at-chip">
      <img src={attached.url} alt="" />
      <span className="at-grow">{t("pic.attached")}</span>
      <button type="button" aria-label={t("pic.remove")} title={t("pic.remove")} onClick={() => setAttached(null)}>✕</button>
    </div>
  ) : null;
  const dialog = open ? (
    <AttachDialog
      phone={phone}
      onUse={(a) => {
        setAttached(a);
        setOpen(false);
      }}
      onClose={() => setOpen(false)}
    />
  ) : null;
  return { attached, button, chip, dialog, clear: () => setAttached(null) };
}

function AttachDialog({ phone, onUse, onClose }: { phone: boolean; onUse: (a: Attached) => void; onClose: () => void }) {
  const t = useT();
  const promptId = useId();
  const modelId = useId();
  const fileId = useId();
  const [prompt, setPrompt] = useState("");
  const [models, setModels] = useState<ImageModel[]>([]);
  const [model, setModel] = useState(readModel);
  const [picked, setPicked] = useState<Attached | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void listImageModels().then((m) => {
      if (live) setModels(m);
    });
    return () => {
      live = false;
    };
  }, []);
  const setModelSaved = (v: string) => {
    setModel(v);
    try {
      localStorage.setItem(MODEL_KEY, v);
    } catch {
      // a per-viewer convenience only
    }
  };

  const pickFile = async (f: File | undefined) => {
    if (!f || busy) return;
    setError("");
    if (!PICTURE_TYPES.includes(f.type)) return setError(t("profiles.new.pictureType"));
    if (f.size > PICTURE_MAX_BYTES) return setError(t("profiles.new.pictureSize"));
    setBusy(t("pic.uploading"));
    try {
      setPicked({ url: await uploadPicture(f), alt: f.name.replace(/\.[^.]+$/, "").slice(0, 120), gen: false });
    } catch (e) {
      setError(t("pic.uploadFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
    setBusy("");
  };
  const draw = async () => {
    const p = prompt.trim();
    if (!p || busy) return;
    setError("");
    setBusy(t("pic.drawing"));
    try {
      setPicked({ url: await generatePicture(p, model, 200), alt: p.slice(0, 200), gen: true });
    } catch (e) {
      setError(t("pic.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
    setBusy("");
  };

  const options = imageOptions(models, model, t("pic.engineDefault"));
  return (
    <Dialog title={t("pic.title")} width={560} sheet={phone} onClose={onClose}>
      <div className="pf-body pic-body">
        <div className="at-view" aria-live="polite">
          {picked ? <img src={picked.url} alt="" /> : <span>{busy || t("pic.empty")}</span>}
        </div>
        <div className="at-row">
          <button type="button" className="btn" disabled={!!busy} onClick={() => document.getElementById(fileId)?.click()}>{t("pic.upload")}</button>
          <input
            id={fileId}
            type="file"
            accept={PICTURE_TYPES.join(",")}
            className="hidden"
            tabIndex={-1}
            onChange={(e) => {
              void pickFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {busy && picked && <span className="k">{busy}</span>}
        </div>
        <div className="f f-wide">
          <label htmlFor={promptId} className="lb">{t("pic.prompt")}</label>
          <textarea id={promptId} className="inp inp-area" rows={3} placeholder={t("pic.promptHint")} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </div>
        <div className="f f-wide">
          <span className="lb" id={modelId}>{t("pic.model")}</span>
          {PREVIEW ? <Pick labelledBy={modelId} value={model} options={options} onChange={setModelSaved} /> : <ModelPick labelledBy={modelId} value={model} options={options} onChange={setModelSaved} />}
        </div>
        <div className="k">{t("pic.cost")}</div>
        {error && <div className="form-err" role="alert">{error}</div>}
      </div>
      <div className="pf-foot">
        <span className="grow" />
        <button type="button" className="btn" onClick={onClose}>{t("pic.cancel")}</button>
        <button type="button" className="btn" disabled={!!busy || !prompt.trim()} onClick={() => void draw()}>{t(picked?.gen ? "pic.again" : "pic.draw")}</button>
        <button type="button" className="btn cta" disabled={!picked || !!busy} onClick={() => picked && onUse(picked)}>{t("pic.use")}</button>
      </div>
    </Dialog>
  );
}
