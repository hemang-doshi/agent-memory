import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { loadProject } from "../core/context.js";
import { getKeywordIndexHealth, rebuildKeywordIndex } from "../core/keyword-index.js";
import { getVectorIndexHealth, rebuildVectorIndex } from "../vector/vector-index.js";
import { openDatabase, SCHEMA_VERSION, runColumnMigrations, type MigrationStep } from "../db/database.js";

export interface MigrationStatus {
  currentVersion: string;
  latestVersion: string;
  pending: string[];
  steps?: MigrationStep[];
}

export interface BackupResult {
  backupPath: string;
  files: string[];
}

export interface RepairResult {
  repaired: boolean;
  issues: string[];
  keywordIndex: Awaited<ReturnType<typeof getKeywordIndexHealth>>;
  vectorIndex: Awaited<ReturnType<typeof getVectorIndexHealth>>;
}

function copyFiles(srcDir: string, destDir: string): string[] {
  mkdirSync(destDir, { recursive: true });
  const files = readdirSync(srcDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  for (const file of files) {
    cpSync(join(srcDir, file), join(destDir, file), { force: true });
  }
  return files;
}

export async function migrationStatus({ cwd }: { cwd: string }): Promise<MigrationStatus> {
  const loaded = await loadProject(cwd);
  try {
    const db = openDatabase(loaded.context.storePath);
    try {
      const steps = runColumnMigrations(db);
      const pending = steps.filter((step) => !step.alreadyApplied).map((step) => step.step);
      db.close();
      return {
        currentVersion: SCHEMA_VERSION,
        latestVersion: SCHEMA_VERSION,
        pending,
        steps
      };
    } catch (error) {
      db.close();
      throw error;
    }
  } finally {
    loaded.close();
  }
}

export async function migrateUp({ cwd }: { cwd: string }): Promise<MigrationStatus> {
  const loaded = await loadProject(cwd);
  try {
    const db = openDatabase(loaded.context.storePath);
    try {
      const steps = runColumnMigrations(db);
      const appliedNow = steps.filter((step) => step.appliedNow);
      const pending = steps.filter((step) => !step.alreadyApplied).map((step) => step.step);
      db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)").run(
        "schema_version",
        SCHEMA_VERSION
      );
      db.close();
      return {
        currentVersion: SCHEMA_VERSION,
        latestVersion: SCHEMA_VERSION,
        pending,
        steps
      };
    } catch (error) {
      db.close();
      throw error;
    }
  } finally {
    loaded.close();
  }
}

export async function backupStore({
  cwd,
  outputDir
}: {
  cwd: string;
  outputDir?: string;
}): Promise<BackupResult> {
  const loaded = await loadProject(cwd);
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupRoot = outputDir ? resolve(cwd, outputDir) : join(loaded.context.memoryDir, "backups");
    const backupPath = join(backupRoot, `backup-${stamp}`);
    const files = copyFiles(loaded.context.memoryDir, backupPath);
    return { backupPath, files };
  } finally {
    loaded.close();
  }
}

export async function restoreStore({
  cwd,
  backupPath
}: {
  cwd: string;
  backupPath: string;
}): Promise<BackupResult> {
  const loaded = await loadProject(cwd);
  const memoryDir = loaded.context.memoryDir;
  loaded.close();

  const resolvedBackup = resolve(cwd, backupPath);
  if (!existsSync(resolvedBackup)) {
    throw new Error(`Backup path not found: ${backupPath}`);
  }
  const safetyBackup = await backupStore({ cwd });
  const files = copyFiles(resolvedBackup, memoryDir);
  return {
    backupPath: safetyBackup.backupPath,
    files: files.map((file) => `${basename(resolvedBackup)}/${file}`)
  };
}

export async function repairStore({ cwd }: { cwd: string }): Promise<RepairResult> {
  const loaded = await loadProject(cwd);
  const issues: string[] = [];
  try {
    try {
      loaded.repo.listMemories(loaded.project.projectId);
      loaded.repo.listEvents(loaded.project.projectId);
      loaded.repo.listMemoryCandidates(loaded.project.projectId);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  } finally {
    loaded.close();
  }

  const keywordIndex = await rebuildKeywordIndex({ cwd });
  const vectorIndex = await rebuildVectorIndex({ cwd });
  return {
    repaired: issues.length === 0,
    issues,
    keywordIndex,
    vectorIndex
  };
}

export async function clearBackups({ cwd }: { cwd: string }): Promise<void> {
  const loaded = await loadProject(cwd);
  try {
    rmSync(join(loaded.context.memoryDir, "backups"), { recursive: true, force: true });
  } finally {
    loaded.close();
  }
}
