---
title: 'The session test "refuses to reset while a run is in progress" timed out once under a parallel test run'
type: observation
status: spotted
spotted: 2026-11-21
---

While building `project-link-overlay-encoding`, an unchanged test in `web/test/lib/playground/session.test.ts`, "refuses to reset while a run is in progress", failed on its 1-second poll timeout during a parallel run, passed when re-run alone, and passed in `pnpm verify`. The build machine was running other builds at the time. One occurrence so far: if it recurs, the poll timeout is the first suspect, since it is short for a run that has to start a worker.
