# SEO-2: プレビュー直接 URL の noindex

- 旧 PHASE13 (CurseForge) を `.archive/docs/planning/PHASE13_PLAN.md` へ `git mv`
- Phase 13 正本は SEO。`buildDiscoverModalMetadata` を直接ページの `generateMetadata` に接続
- `/discover/<複数>/<slug>`: `robots: { index: false, follow: true }` + canonical `/<型>/<slug>`
- 詳細・一覧は index 維持。SEO-1 未実施
- 検証: typecheck, biome, 1235 tests, build (Modrinth ECONNRESET は ISR フォールバック)
