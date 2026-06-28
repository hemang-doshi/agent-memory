import { openDatabase } from "../db/database.js";
import { AgentMemoryRepository } from "../db/repository.js";
import {
  buildProjectRecord,
  initProjectContext,
  loadExistingProjectContext,
  type InitProjectContextOptions
} from "../config/project-context.js";
import type { ProjectContext } from "../config/project-context.js";
import type { ProjectRecord } from "../domain/types.js";

export interface LoadedProject {
  context: ProjectContext;
  project: ProjectRecord;
  repo: AgentMemoryRepository;
  close: () => void;
}

async function openProject(context: ProjectContext): Promise<LoadedProject> {
  const db = openDatabase(context.storePath);
  try {
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
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function initProject(
  cwd: string,
  options: InitProjectContextOptions = {}
): Promise<LoadedProject> {
  return openProject(await initProjectContext(cwd, options));
}

export async function loadProject(cwd: string): Promise<LoadedProject> {
  return openProject(await loadExistingProjectContext(cwd));
}
