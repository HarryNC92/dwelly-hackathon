# Case-state expectations

One JSON per public case under `expected/`: `cut` (last event included), then any of `stage`, `approval`, `provider`
(substring of the assigned provider's name, or `null` for none), `occupancy`, `conflicts` (substrings that must appear in
`dataConflicts`), `conflictsMin`, `tier`. `_why` says what the decision point is. Fields left out are not scored.

Compare and print the all-fifty distribution:

```bash
pnpm casestate -- --all "HackatonPublicCases/Property Management"            # add --quiet to hide the per-case table
pnpm casestate -- --case "HackatonPublicCases/Property Management/043" --cut 13   # one case: JSON plus rendering
```
