// The models the user has switched on in the engine, fetched once per page load and shared by every picker.
import { useEffect, useState } from "react";
import { listModels, type ModelChoice } from "@/lib/api";

let cached: Promise<ModelChoice[]> | null = null;

export function useModelChoices(): ModelChoice[] {
  const [models, setModels] = useState<ModelChoice[]>([]);
  useEffect(() => {
    let live = true;
    cached ??= listModels();
    void cached.then((m) => {
      if (live) setModels(m);
    });
    return () => {
      live = false;
    };
  }, []);
  return models;
}
