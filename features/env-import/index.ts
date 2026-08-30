export {
  detectEnvironment,
  detectors,
  createDetectorChain,
  DETECTOR_REGISTRY,
  rootTypeLabel,
  InstanceFileDetector,
  OfficialLauncherDetector,
  PrismDetector,
  MojoLauncherDetector,
  GenericDetector,
  type DetectorDefinition,
  type DetectedEnvironment,
  type EnvironmentDetector,
  type RootType,
  type ParsedLauncherEnv,
  type InstanceFileDetectorOptions
} from './detector';
export {
  analyzeEnvironmentSource,
  CATEGORY_EXTENSIONS,
  hasExtension,
  type AnalyzeProgress,
  type ImportAnalysis
} from './analyzer';
export { pickMinecraftDirectory, type PickedDirectory } from './picker';
export { generateProfileName, isUsableFolderName } from './profileName';
export { detectContentDirs } from './detector/types';
