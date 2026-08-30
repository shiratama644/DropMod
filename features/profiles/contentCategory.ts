import type { ContentCategory, ProjectItem, ModrinthProject } from '@/types';

export function contentCategoryOf(
  item: Pick<ProjectItem, 'type'> | { type?: string }
): ContentCategory {
  if (item.type === 'resourcepack' || item.type === 'shader') {
    return item.type;
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
