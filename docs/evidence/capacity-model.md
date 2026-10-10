# Capacity model (46 completed cases from out/public-real-7, out/sample-2, out/public-real-3)

| Scenario | Per case | Cases/min at concurrency 10 | Minutes to clear 50 | Fits 30-min window |
|---|---|---|---|---|
| Best (fastest quartile) | 31s | 19.5 | 2.6 | yes |
| Median | 38s | 15.6 | 3.2 | yes |
| Average | 44s | 13.8 | 3.6 | yes |
| Worst (slowest decile) | 67s | 8.9 | 5.6 | yes |
| Slowest observed | 115s | 5.2 | 9.6 | yes |

Mean model steps per case: 3.2. Mean tokens per case: 69,131 in, 4,276 out.

Throughput is linear in concurrency until the API rate limit; per-case time is bounded by the step cap (10 to 12 steps) and the per-case timeout (4 min), so the worst case is bounded, not open-ended.

| Tier | Cases | Mean per case | Mean steps |
|---|---|---|---|
| unflagged | 32 | 37s | 2.5 |
| flagged | 14 | 60s | 4.7 |
