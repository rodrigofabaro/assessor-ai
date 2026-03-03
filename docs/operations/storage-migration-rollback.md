# Storage Migration + Rollback Runbook

Last updated: 2026-03-03

This runbook covers file + database migration for deployment environments, with explicit rollback steps.

Scope:
- `uploads/`
- `reference_uploads/`
- `storage/` (including `storage/exports/`, `storage/iv-ad/`, and other generated artifacts)
- PostgreSQL data referenced by those files

## 1) Preconditions

1. Deployment freeze window approved.
2. Source and target environments are reachable.
3. Disk space on target is at least 2x current source storage footprint.
4. `DATABASE_URL` for source and target are available to operator.
5. App write traffic is paused (maintenance mode or deployment drain) before final sync.

## 2) Backup checkpoint (required before migration)

Create a dated backup root on source operator machine:

```powershell
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupRoot = ".\backups\deploy-$Stamp"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
```

### 2.1 File backups (zip archives)

```powershell
Compress-Archive -Path ".\uploads\*" -DestinationPath "$BackupRoot\uploads.zip" -Force
Compress-Archive -Path ".\reference_uploads\*" -DestinationPath "$BackupRoot\reference_uploads.zip" -Force
Compress-Archive -Path ".\storage\*" -DestinationPath "$BackupRoot\storage.zip" -Force
```

### 2.2 Database backup

```powershell
pg_dump --format=custom --file "$BackupRoot\db.backup" "$env:DATABASE_URL"
```

### 2.3 Backup integrity manifest

```powershell
Get-FileHash "$BackupRoot\uploads.zip" -Algorithm SHA256 | Format-List
Get-FileHash "$BackupRoot\reference_uploads.zip" -Algorithm SHA256 | Format-List
Get-FileHash "$BackupRoot\storage.zip" -Algorithm SHA256 | Format-List
Get-FileHash "$BackupRoot\db.backup" -Algorithm SHA256 | Format-List
```

Record these hashes in release notes or deployment evidence.

## 3) Migration execution

## 3.1 Database restore to target

```powershell
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$env:TARGET_DATABASE_URL" "$BackupRoot\db.backup"
```

## 3.2 File restore/sync to target app root

Run from target app root:

```powershell
Expand-Archive -Path "$BackupRoot\uploads.zip" -DestinationPath ".\uploads" -Force
Expand-Archive -Path "$BackupRoot\reference_uploads.zip" -DestinationPath ".\reference_uploads" -Force
Expand-Archive -Path "$BackupRoot\storage.zip" -DestinationPath ".\storage" -Force
```

If target already has files and you need a merge-safe copy, prefer `robocopy`:

```powershell
robocopy "$SourceRoot\uploads" ".\uploads" /E /COPY:DAT /R:2 /W:2
robocopy "$SourceRoot\reference_uploads" ".\reference_uploads" /E /COPY:DAT /R:2 /W:2
robocopy "$SourceRoot\storage" ".\storage" /E /COPY:DAT /R:2 /W:2
```

## 3.3 App deploy steps

```powershell
pnpm install
pnpm prisma generate
pnpm prisma migrate deploy
pnpm run build
pnpm start
```

## 4) Post-migration verification (must pass)

1. File presence checks:

```powershell
Get-ChildItem .\uploads -Recurse | Measure-Object
Get-ChildItem .\reference_uploads -Recurse | Measure-Object
Get-ChildItem .\storage -Recurse | Measure-Object
```

2. App quality gates:

```powershell
pnpm exec tsc --noEmit --incremental false
pnpm run test:regression-pack
pnpm run test:export-pack-validation
```

3. Functional smoke:
- follow `docs/ops-checklist.md`
- run `pnpm run ops:export-pack-evidence` and confirm artifact in `docs/evidence/export-pack/`

## 5) Rollback triggers

Trigger rollback immediately for:
1. P1 route failure (`/submissions`, `/api/submissions/*`, `/admin/iv-ad`, export APIs).
2. Data integrity mismatch (missing file references, failed marked PDF retrieval, manifest checksum mismatch).
3. Migration side-effects that block grading or export path.

## 6) Rollback procedure

1. Stop current app instance.
2. Restore previous DB checkpoint:

```powershell
pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$env:TARGET_DATABASE_URL" "$BackupRoot\db.backup"
```

3. Restore file archives:

```powershell
Remove-Item ".\uploads\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\reference_uploads\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item ".\storage\*" -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path "$BackupRoot\uploads.zip" -DestinationPath ".\uploads" -Force
Expand-Archive -Path "$BackupRoot\reference_uploads.zip" -DestinationPath ".\reference_uploads" -Force
Expand-Archive -Path "$BackupRoot\storage.zip" -DestinationPath ".\storage" -Force
```

4. Restart previous app release artifact/commit.
5. Re-run smoke checks from `docs/ops-checklist.md` before reopening traffic.

## 7) Evidence to store after migration/rollback drill

Store under `docs/evidence/deploy-storage/`:
1. backup hash manifest
2. restore command transcript
3. post-migration verification output
4. rollback drill output (if performed)
