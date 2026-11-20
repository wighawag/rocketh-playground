<!-- dorfl-sidecar: item=task:persist-project-files type=task slug=persist-project-files allAnswered=false -->

## Q1

**'task:persist-project-files' was bounced — how should we proceed?**

> continuing the kept work/task-persist-project-files: rebasing `work/task-persist-project-files` onto current main (3c422a10c7d19e9f3597553a43a404454b964f70) conflicted on work/tasks/done/persist-project-files.md (aborted, never auto-resolved) — run `requeue --reconcile` to non-destructively re-sync the mirror and retry the rebase (keeps the work). Last resort: `requeue --reset` DESTRUCTIVELY discards the branch and starts fresh.

<!-- q1 fields: id=q1 kind=stuck -->

**Your answer** (write below this line):
Retry, continuing from the kept branch: the conflict is only the branch's done-move of the task file against the answer applied on main. The conductor rebases the branch onto main by hand, keeping main's task body (with its applied answers) and the branch's Decisions block, then re-dispatches. The instruction of the previous answer still stands: keep the persist work and make `ensureSoljson` write atomically (temporary file, then rename), so `pnpm verify` passes from a tree with no `web/static/solc/`.
