# Submission Checklist

- Team name:
- Track: Property Management
- Team members:
- Repository URL: https://github.com/jeremy-shr/dwelly-hackathon
- Code-freeze commit hash:
- Reality Test results path: `ANSWERS/`
- Demo video path: `demo/demo.mp4`
- LinkedIn post URL:
- X post URL:

## Required Repo Contents

- [ ] Public repository is available.
- [ ] `LICENSE` is present and Apache 2.0.
- [ ] `README.md` explains what was built, the operational problem, architecture, run instructions, models/services, assumptions, limitations and next steps.
- [ ] `ANSWERS/<n>/ANSWER.md` exists for every Reality Test case.
- [ ] `ANSWERS/<n>/REASONING.md` exists for every Reality Test case.
- [ ] Traces/logs are present where practical (`trace.jsonl` per generated case).
- [ ] Demo video is committed or linked at the submitted path.
- [ ] No `.env`, API key or generated `out/` folder is committed.

## Reality Test Command

```bash
scripts/reality-test.sh "HackatonPublicCases/HackatonChallendges/Property Management" 10
```

The script prints the commit hash to use in the submission form after committing generated `ANSWERS/`.
