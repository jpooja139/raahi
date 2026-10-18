# Problem validation (copied in for review)

These files were produced in the team's workspace (`AIBuilder/problem-validation/`)
and copied here so that the README's problem numbers can be checked.

- `REPORT.md`: findings and caveats.
- `results.json`: per-cohort aggregates. The old-vs-new tutorial numbers are cohorts `B_old` and `B_new`.
- `collect.py`, `analyze.py`: how the data was collected (YouTube Data API v3) and coded (regex codebook).

They ran from `AIBuilder/problem-validation/`, where `collect.py` reads the YouTube key from
`../raahi/.env`; from this folder that path doesn't resolve. Raw comment dumps are not
included. Commenter names and ids were never stored.
