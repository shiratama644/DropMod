// -----------------------------------------------------------------------------
// ESLint flat config (Next.js 16 で `next lint` が削除された移行対応)
//
// eslint-config-next の推奨ルールをベースに、プロジェクト独自の緩和ルールを設定。
// eslint-config-next@16 は flat config 配列を直接 export する。
//
// React 19 で新設された以下 2 ルールは、当プロジェクトの stale closure 対策
// (render 中に Ref に同期セット) と衝突するため意図的に無効化:
//   - react-hooks/refs
//   - react-hooks/set-state-in-effect
// これらのパターンは「安全な理由付きの使用」として設計確定済みなので
// ルール違反として扱わない (詳しい経緯は docs/issues.md を参照)。
// -----------------------------------------------------------------------------

import nextConfig from 'eslint-config-next';

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      '.archive/**',
      'out/**',
      'build/**',
      'coverage/**',
      'next-env.d.ts',
      '*.tsbuildinfo'
    ]
  },
  ...nextConfig,
  {
    rules: {
      // <img> は Markdown 内画像 (width/height 不明) では避けられない → warn に緩和
      '@next/next/no-img-element': 'warn',
      // React 19 の JSX transform で明示的な React import は不要
      'react/react-in-jsx-scope': 'off',
      // JSX 内で日本語文字列を許容 (react/no-unescaped-entities は日本語で誤検出多発)
      'react/no-unescaped-entities': 'off',
      // 既存の stale closure 対策 (Ref に render 中同期セット) を許容
      // (詳しい経緯は docs/issues.md を参照)
      'react-hooks/refs': 'off',
      // useEffect 内での破損 LocalStorage 復旧・hydration 直後の同期は必要
      // (詳しい経緯は docs/issues.md を参照)
      'react-hooks/set-state-in-effect': 'off'
    }
  }
];

export default config;
