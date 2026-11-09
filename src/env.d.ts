declare module "*.css";

// `import.meta.glob`: the engine's in-browser builder turns a literal call into lazy imports (Vite semantics, the subset it supports).
interface ImportMeta {
  glob<T = unknown>(pattern: string, options?: { query?: string; import?: string; eager?: boolean }): Record<string, () => Promise<T>>;
}
