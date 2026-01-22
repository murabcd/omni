---
summary: "Skill configuration in Omni"
read_when:
  - Adding or editing runtime skills
---
# Skills config

Omni reads runtime skills from the workspace:

```
skills/**/skill.json
```

There is no separate global config file. Each skill defines:

- `name` — used by `/skill <name>`
- `description` — shown by `/skills`
- `tool` — `yandex-tracker.<tool_name>`
- `args` — optional default arguments
- `timeoutMs` — optional per-skill timeout
