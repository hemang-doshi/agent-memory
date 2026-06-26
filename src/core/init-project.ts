import { toInitProjectResult } from "../config/project-context.js";

import { initProject as initProjectContext } from "./context.js";

export async function initProject({ cwd, gitInit = false }: { cwd: string; gitInit?: boolean }) {
  const loaded = await initProjectContext(cwd, { gitInit });

  try {
    return toInitProjectResult(loaded.project, loaded.context);
  } finally {
    loaded.close();
  }
}
