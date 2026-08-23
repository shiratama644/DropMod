import { redirect } from 'next/navigation';

/** 旧検索 URL。正規は /discover/mods（next.config でも 308）。 */
export default function LegacyModsSearchPage() {
  redirect('/discover/mods');
}
