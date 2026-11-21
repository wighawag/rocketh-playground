<!-- dorfl-sidecar: item=task:format-the-web-sources type=task slug=format-the-web-sources allAnswered=false -->

## Q1

**'task:format-the-web-sources' was bounced — how should we proceed?**

> acceptance gate failed (exit 1) on the rebased tip — the failing step was: `pnpm verify`; its last output was:
>
>  FAIL  test/lib/playground/v1-script.test.ts > a v1-style deploy script > is recognised when it reads getNamedAccounts from rocketh's environment (its types imports are erased)
> Error: Test timed out in 5000ms.
> If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
>  ❯ test/lib/playground/v1-script.test.ts:47:2
>      45|  };
>      46|
>      47|  it("is recognised when it reads getNamedAccounts from rocketh's envir…
>        |  ^
>      48|   const error = await failing(V1_DEPLOY_FUNCTION);
>      49|   expect(error).toMatchObject({
> ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
>  Test Files  1 failed | 32 passed (33)
>       Tests  1 failed | 302 passed | 1 skipped (304)
>    Start at  07:21:49
>    Duration  16.81s (transform 4.44s, setup 0ms, import 8.95s, tests 53.17s, environment 10ms)
> /tmp/dorfl-fresh-gate-H9MB8V/tip/web:
>  ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  rocketh-playground-web@0.0.1 test: `vitest run`
> Exit status 1
>  ELIFECYCLE  Command failed with exit code 1.
>  ELIFECYCLE  Command failed with exit code 1.

<!-- q1 fields: id=q1 kind=stuck -->

**Your answer** (write below this line):
