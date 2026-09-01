import { serializeJsonLd } from '../utils/jsonld';

/** RSC 用 JSON-LD。ユーザー入力は JSON.stringify + `<` エスケープ。 */
export function JsonLd({ data }: { data: unknown }) {
  return (
    // biome-ignore lint/security/noDangerouslySetInnerHtml: schema.org の JSON-LD。serializeJsonLd で < をエスケープ
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }} />
  );
}
