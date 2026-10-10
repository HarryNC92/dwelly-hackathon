# Eval report

Run: /Users/jeremy/Desktop/code/fabriq/dwelly-hackathon/out/sample-2
Score: 92/100 checks (92%)

| Case | State | Family | Urgency | Esc | Checks | Failures |
|---|---|---|---|---|---|---|
| S01-blocked-toilet | scheduled | maintenance | P1 | P1 | 7/8 | P1≠none |
| S02-gas-smell-call | escalated | maintenance | P0 | P0 | 6/6 |  |
| S03-leak-flat5 | scheduled | maintenance | P1 | none | 4/5 | P1≠P2 |
| S04-leak-flat3-duplicate | escalated | maintenance | P0 | P0 | 5/5 |  |
| S05-landlord-bank-change | escalated | landlord | P1 | P1 | 7/7 |  |
| S06-arrears-hardship | awaiting_approval | arrears | P1 | P1 | 6/6 |  |
| S07-gas-cert-access-refused | escalated | compliance | P1 | P1 | 5/5 |  |
| S08-applicant-cat | awaiting_approval | lifecycle | P2 | none | 5/6 | none≠P1 |
| S09-landlord-section21 | escalated | landlord | P1 | P1 | 5/7 | landlord≠lifecycle; found /served|will serve|serving the notice/ |
| S10-complaint-solicitor | escalated | complaint | P1 | P1 | 5/5 |  |
| S11-spam | closed_no_action | noise | P2 | none | 7/7 |  |
| S12-boiler-conflict | scheduled | maintenance | P1 | P1 | 5/6 | P1≠none |
| S13-mould-newborn | escalated | maintenance | P1 | P1 | 8/8 |  |
| S14-decision-point | awaiting_approval | maintenance | P1 | P1 | 5/5 |  |
| S15-injection | escalated | compliance | P2 | P1 | 6/8 | compliance≠lifecycle; P1≠none |
| S16-break-in | escalated | maintenance | P0 | P0 | 6/6 |  |
