# Integrity report

Command run order requested: `pnpm -v` → `pnpm install` (if needed) → `pnpm run lint` → `pnpm run typecheck` (if present) → `pnpm run test` (if present) → `pnpm run build`.

## Results

1. **`pnpm -v`** — **PASS**
   - Output: `10.13.1`.
   - File paths mentioned: none.

2. **`pnpm install`** — **PASS**
   - Outcome: lockfile already up to date.
   - Relevant output:
     - `Lockfile is up to date, resolution step is skipped`
     - `Already up to date`
     - Warning: ignored build scripts for `@prisma/client`, `@prisma/engines`, `prisma`, `sharp`, `unrs-resolver`.
   - File paths mentioned: none.

3. **`pnpm run lint`** — **PASS**
   - Relevant output:
     - `next lint is deprecated ...`
     - `✔ No ESLint warnings or errors`
   - File paths mentioned: none.

4. **`pnpm run typecheck`** — **NOT CONFIGURED**
   - `package.json` does not define a `typecheck` script.

5. **`pnpm run test`** — **NOT CONFIGURED**
   - `package.json` does not define a `test` script.

6. **`pnpm run build`** — **FAIL**
   - Build reached compilation and type-check phase, then failed.
   - Relevant error output (short):
     - `Type error: Module '"@prisma/client"' has no exported member 'Submission'.`
     - `./app/api/submissions/upload/route.ts:7:15`
     - `Next.js build worker exited with code: 1`
   - File paths mentioned:
     - `app/api/submissions/upload/route.ts`

## Notes

- No build/test failures were modified or fixed as part of this documentation task.
- This report reflects only commands actually run in this environment.
