export {
  type LocalFileEntry,
  type SyncEntryKind,
  type SyncPlanEntry,
  type SyncConflictEntry,
  type SyncPlanTotals,
  type SyncPlan,
  type ComputeSyncPlanInput,
  CATEGORY_DIR_KEY,
  buildTargetPath,
  computeSyncPlan,
  selectExternallyModified,
  selectDeletionsRequiringConfirm,
  excludeDeletions
} from '@/features/sync/diff';
