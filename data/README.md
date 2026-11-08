# Social data

This folder is the app's data folder (the only place its plugins may read and write; the engine requires
it to exist, which is why this file ships with the app). Files appear here as you use Social.

- `profiles/<id>.json`: one file per profile, as the Profiles screen edits it: `id`, `name`, `hue`, `source`
  (`roleplay`, `own` or `persona`), `nick`, `about`, `interests`, `habits`, `habitsAuto`, `voice`, `forum`,
  `schedule` (8 time bands by 7 days of statuses), `createdAt`, `updatedAt`. A Roleplay card is never stored here;
  a profile is a one-time digest of it.
- `settings.json`: the app settings (forum activity, limits, quiet hours, models, notifications). Models are
  model references, or an empty string for the engine's default model.
