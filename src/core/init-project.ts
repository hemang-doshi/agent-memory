import { toInitProjectResult } from "../config/project-context.js";

import { loadProject } from "./context.js";

export async function initProject({ cwd }: { cwd: string }) {
  const loaded = await loadProject(cwd, true);

  try {
    return toInitProjectResult(loaded.project, loaded.context);
  } finally {
    loaded.close();
  }
}
