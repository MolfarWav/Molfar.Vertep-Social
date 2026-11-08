---
name: guide
description: Use FIRST when the user asks how to use Social, where something is in it, or what a part of it is (profiles, messenger statuses, forum limits). Triggers: "як", "де", "чи можна", "що таке", "how do I", "where is", "can I", "what is". The Social user guide.
---

# Answering usage questions about Social

Answer from these pages, not from the code. Read the page that fits:
`skill_load { name: "guide", scope: "app:social", file: "pages/<page>.md" }`.

- `index`: what Social is, a map of its parts
- `messenger`: contacts, statuses, chats
- `forum`: boards, topics, the autonomy strip
- `profiles`: import from Roleplay, new profiles, the editor, Fill empty
- `you`: your own personas, the one characters are told about
- `settings`: limits, quiet hours, models, notifications, Roleplay access

Only when the guide does not cover it, read the code, and say "the guide does not cover this; from the code: ...".
