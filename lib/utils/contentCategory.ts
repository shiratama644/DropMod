import type { ContentCategory, ModItem, ModrinthProject } from '@/types';

export function contentCategoryOf(
  item: Pick<ModItem, 'projectType'> | { projectType?: string }
): ContentCategory {
  if (item.projectType === 'resourcepack' || item.projectType === 'shader') {
    return item.projectType;
  }
  return 'mod';
}

export function contentCategoryFromProject(
  project: Pick<ModrinthProject, 'project_type'>
): ContentCategory {
  if (project.project_type === 'resourcepack' || project.project_type === 'shader') {
    return project.project_type;
  }
  return 'mod';
}

/** .mrpack / ZIP 内の相対パスからカテゴリを推定 */
export function contentCategoryFromPath(path: string | undefined | null): ContentCategory {
  const normalized = (path ?? '').replace(/\\/g, '/').toLowerCase();
  if (
    normalized.startsWith('shaderpacks/') ||
    normalized.includes('/shaderpacks/') ||
    normalized === 'shaderpacks'
  ) {
    return 'shader';
  }
  if (
    normalized.startsWith('resourcepacks/') ||
    normalized.includes('/resourcepacks/') ||
    normalized === 'resourcepacks'
  ) {
    return 'resourcepack';
  }
  return 'mod';
}
