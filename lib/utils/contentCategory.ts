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
