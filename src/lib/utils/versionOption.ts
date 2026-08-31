import type { DropdownOption, VersionChannel } from '@/types';

export function versionChannel(type?: string | null): VersionChannel {
  if (type === 'alpha') return 'alpha';
  if (type === 'beta') return 'beta';
  return 'stable';
}

export const VERSION_CHANNEL_ICON: Record<VersionChannel, string> = {
  stable: 'fa-circle-check',
  beta: 'fa-flask',
  alpha: 'fa-vial'
};

export function versionDropdownOption(
  versionNumber: string,
  versionId: string,
  versionType?: string | null
): DropdownOption {
  const tone = versionChannel(versionType);
  return {
    label: versionNumber,
    value: versionId,
    icon: VERSION_CHANNEL_ICON[tone],
    tone
  };
}
