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
import { writeFileSync } from "node:fs";

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

    let project = context.config.project_id
      ? repo.getProjectById(context.config.project_id) ?? null
      : null;

    if (!project) {
      project = repo.getProjectByRoot(context.gitRoot);
    }

    if (project) {
      if (project.gitRoot !== context.gitRoot || project.configPath !== context.configPath) {
        project.gitRoot = context.gitRoot;
        project.configPath = context.configPath;
        repo.updateProjectRoot(project.projectId, context.gitRoot, project.gitRemoteHash, context.configPath);
      }

      if (!context.config.project_id) {
        context.config.project_id = project.projectId;
        writeFileSync(context.configPath, JSON.stringify(context.config, null, 2));
      }
    } else {
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
