export type ThemeMode = 'dark' | 'light';
export type TabName = 'home' | 'mods' | 'settings';

export interface ModItem {
  id: string;
  slug?: string;
  title: string;
  description?: string;
  icon_url?: string;
  author?: string;
  category?: string;
  selectedVersionId?: string;
  selectedVersionNumber?: string;
  versionType?: string;
  fileUrl?: string;
  filename?: string;
}

export interface Profile {
  id: string;
  name: string;
  mcVersion: string;
  loader: string;
  description?: string;
  mods: ModItem[];
}

export interface ModrinthHit {
  project_id: string;
  project_type: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories: string[];
  versions: string[];
  downloads: number;
  icon_url: string;
}

export interface ModrinthGalleryImage {
  url: string;
  featured?: boolean;
  title?: string;
  description?: string;
  created?: string;
  ordering?: number;
}

export interface ModrinthProject {
  id: string;
  slug: string;
  project_type: string;
  title: string;
  description: string;
  body?: string;
  gallery?: ModrinthGalleryImage[];
  categories: string[];
  display_categories: string[];
  downloads: number;
  icon_url?: string;
  published: string;
  updated: string;
  author?: string;
}

export interface ModrinthVersionFile {
  url: string;
  filename: string;
  primary: boolean;
  size: number;
}

export interface ModrinthDependency {
  project_id: string;
  version_id?: string;
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  author_id: string;
  featured: boolean;
  name: string;
  version_number: string;
  changelog?: string;
  date_published: string;
  downloads: number;
  version_type: 'release' | 'beta' | 'alpha';
  files: ModrinthVersionFile[];
  dependencies?: ModrinthDependency[];
  game_versions: string[];
  loaders: string[];
}

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning';
}

export interface DropdownOption {
  label: string;
  value: string;
}

export interface DependencyCheckData {
  missingRequired: Array<{ sourceMod: ModItem; targetProjectId: string }>;
  conflicts: Array<{ sourceMod: ModItem; targetMod: ModItem | { title: string; id: string } }>;
  optionalAvailable: Array<{ sourceMod: ModItem; targetProjectId: string }>;
  verifiedOK: Array<{ sourceMod: ModItem; message: string }>;
  depProjectMap: Map<string, ModrinthProject>;
}