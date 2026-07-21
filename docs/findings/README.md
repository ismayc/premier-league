# Findings

Durable notes from working on this project: root causes, constraints, and
decisions with the reasoning behind them. Each file is one finding, dated, with
the evidence that established it.

These are things that were **not obvious** and cost real effort to work out —
not a changelog, and not a restatement of what the code already says.

| Finding | Date | What it covers |
|---|---|---|
| [SVG and icon asset traps](svg-asset-traps.md) | 2026-07-21 | Three ways an icon ships silently broken, none caught by build or tests |
| [Where preferences are persisted, and why](preference-persistence-model.md) | 2026-07-21 | URL vs localStorage vs component state, and the rule for choosing |
| [Testing traps](testing-conventions.md) | 2026-07-21 | `npm test` skips the coverage gate; providers live in `main.jsx` |
