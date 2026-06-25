import { openDatabase } from "../db/database.js";
import { AgentMemoryRepository } from "../db/repository.js";
import { buildProjectRecord, ensureProjectContext, initializeGitRepo } from "../config/project-context.js";
import type { ProjectContext, } from "../config/project-context.js";
import type { ProjectRecord } from "../domain/types.js";

export interface LoadedProject {
  context: ProjectContext;
  project: ProjectRecord;
  repo: AgentMemoryRepository;
  close: () => void;
}

export async function loadProject(cwd: string, ensureInitialized = true): Promise<LoadedProject> {
  if (ensureInitialized) {
    await initializeGitRepo(cwd);
  }

  const context = await ensureProjectContext(cwd);
  const db = openDatabase(context.storePath);
  const repo = new AgentMemoryRepository(db);
  let project = repo.getProjectByRoot(context.gitRoot);

  if (!project) {
    project = await buildProjectRecord(context);
    repo.upsertProject(project);
  }

  return {
    context,
    project,
    repo,
    close: () => db.close()
  };
}
