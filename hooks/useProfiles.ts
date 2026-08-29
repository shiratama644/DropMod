'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  Profile,
  ProfileContentExtras,
  ProjectItem,
  ThemeMode,
  ModrinthProject,
  ModrinthVersion,
  ContentCategory
} from '@/types';
import { nextDuplicateName } from '@/lib/utils/profileName';
import { fetchModrinth, fetchStableModVersion } from '@/lib/modrinth/client';
import type { ConfirmDialogOptions } from '@/components/ConfirmDialog';
import { generateId } from '@/lib/utils/id';
import { contentCategoryFromProject, contentCategoryOf } from '@/lib/utils/contentCategory';
import { primaryCategoryId } from '@/lib/constants/categories';
import {
  syncProfiles as dexieSyncProfiles,
  getAllProfiles as dexieGetAllProfiles,
  getMeta as dexieGetMeta,
  setMeta as dexieSetMeta,
  getManagedFiles,
  syncManagedFiles
} from '@/lib/db/dexie';
import { linkPickedDirectory } from '@/lib/env/link';
import { expandProfileToManaged, mergeManagedRecords } from '@/lib/env/managed';
import type { DetectedEnvironment } from '@/lib/env/detector';
import type { PickedDirectory } from '@/lib/env/picker';
import type { LinkedSource } from '@/types';
import {
  migrateFromLocalStorage,
  cleanupExpiredBackup,
  META_KEYS,
  LOCAL_STORAGE_KEYS
} from '@/lib/db/migrate';
import { useProfilesStore } from '@/lib/store/profiles';
import { queryKeys } from '@/lib/query/keys';

type ConfirmFn = (options: ConfirmDialogOptions) => Promise<boolean>;


/**
 * cookie 文字列の Secure フラグを現在のアクセス protocol に応じて組み立てる。
 * Secure cookie は http (localhost 以外) で「黙って拒否」されるため、
 * LAN 内の http://192.168.x.x 等からアクセスした場合に theme /
 * active_profile cookie が保存されず、リロードのたび theme が
 * 既定 (dark) へ戻るバグの原因になっていた (2026-08-27 修正)。
 * https (Vercel 本番) では Secure を付与し続ける。
 */
function cookieSecureSuffix(): string {
  if (typeof window === 'undefined') return '; Secure';
  return window.location.protocol === 'https:' ? '; Secure' : '';
}

// B4 修正: hydration 中の transient fallback は module-level 定数に固定。
//   render のたびに新規オブジェクトを生成しないことで、AppShell register
//   useEffect の deps 比較で「変化なし」判定され、無駄な register/unregister
//   サイクル (B19 と組み合わせて発生する window 問題) を回避する。
const TRANSIENT_FALLBACK_PROFILE: Profile = Object.freeze({
  id: 'transient-fallback',
  name: '既定プロファイル',
  environment: { mcVersion: '1.20.1', loader: 'Fabric' },
  description: '',
  mods: []
}) as Profile;

// `sanitizeLoadedState` は lib/state/sanitize.ts に集約 (第7波 M7-2 修正)。
// 以前は互換のため useProfiles からも re-export していたが、参照 0 の dead code
// だったため削除。fallback 経路 (Dexie 失敗時) の LocalStorage 読み取り用に
// import のみ残す。
import { sanitizeLoadedState as sanitizeLoadedStateShim, normalizeLoader } from '@/lib/state/sanitize';

export const useProfiles = (
  theme: ThemeMode,
  setThemeState: (theme: ThemeMode) => void,
  showToast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
  confirmDialog: ConfirmFn
) => {
  // ------------------------------------------------------------------
  // Sub-Phase 8-C: state を Zustand (useProfilesStore) に委譲。
  //
  // hook は以下の役割:
  //   - store の状態を購読
  //   - Modrinth API 呼び出し・cookie 書き込み・showToast 連携を担う
  //     (副作用を含む action を store から追い出して pure に保つ)
  //   - store の setter に一元アクセス
  //
  // 注意: props 経由の setThemeState (旧 API) と store.setTheme の
  //   両方に書き込むことで、既存の theme 管理 (AppShell useState) との
  //   互換を保ちつつ store を並走させる。次段の Sub-Phase 8-C Step 4 で
  //   props 経由を廃止し、store.setTheme に一本化する。
  // ------------------------------------------------------------------

  // C7-2 修正: TanStack Query client を取得して Modrinth /project/{id} 呼び出しを
  // キャッシュ経由に。同じ project ID の 2 回目以降は fetch を発生させない。
  // Dexie apiCache persister 経由でオフライン時も既読プロジェクト情報を取得可能。
  const queryClient = useQueryClient();

  // 個別 selector で購読することで、他 field 変更時の再レンダーを抑制。
  const profiles = useProfilesStore((s) => s.profiles);
  const currentProfileId = useProfilesStore((s) => s.currentProfileId);
  const hasHydrated = useProfilesStore((s) => s.hasHydrated);

  // action は Zustand 内で stable なので参照が変わらない。
  const setProfiles = useProfilesStore((s) => s.setProfiles);
  const setCurrentProfileId = useProfilesStore((s) => s.setCurrentProfileId);
  const setHasHydrated = useProfilesStore((s) => s.setHasHydrated);

  // ------------------------------------------------------------------
  // 最新 state 参照用 Ref (stale closure 対策)
  //
  // handleToggleMod のような非同期処理の中では、レンダー時点の profiles
  // をキャプチャした値ではなく、常に最新の値を参照する必要がある。
  // AutoFix や連続操作で古い state を見て「未追加」判定してしまい、
  // 追加⇔削除トグルが暴発するのを防ぐ。
  //
  // ⚠️ ref の更新は useEffect ではなく render 中に同期で行う
  //    (useEffect は render 後に非同期で走るため、同じレンダーサイクル内で
  //     発火した非同期処理が古い ref を掴む race を防ぐ)。
  //
  // 補足: Zustand には useProfilesStore.getState() があるが、Ref 更新なしで
  //   直接 getState() を呼ぶと、subscribeWithSelector 経由の購読と挙動が微妙に
  //   ずれる恐れがあるため、既存の Ref パターンを維持する。
  // ------------------------------------------------------------------
  const profilesRef = useRef<Profile[]>(profiles);
  const currentProfileIdRef = useRef<string>(currentProfileId);
  profilesRef.current = profiles;
  currentProfileIdRef.current = currentProfileId;

  // handleToggleMod の並列呼び出し防止用 (同一 projectId への連打で
  // 重複トグルが起きないようにする)
  const toggleInFlightRef = useRef<Set<string>>(new Set());

  // ---------------------------------------------------------------------
  // Sub-Phase 8-A: Dexie (IndexedDB) からの hydration
  //
  //   1. migrateFromLocalStorage()  — 初回起動時のみ LocalStorage → Dexie コピー
  //   2. cleanupExpiredBackup()     — 移行から 7 日経過後は LocalStorage を掃除
  //   3. Dexie の profiles テーブル + meta (theme/currentProfileId) を読む
  //   4. hasHydrated = true にして以降の保存 useEffect を有効化
  //
  // 失敗時 (IndexedDB 利用不可な Safari プライベートブラウズ等) は
  // LocalStorage をフォールバックとして読む。
  // ---------------------------------------------------------------------
  useEffect(() => {
    // M7-3 修正: React Strict Mode の double-effect / 別インスタンスからの
    //   重複 hydrate を避ける。Zustand store は module-global なので、
    //   一度 hasHydrated=true になっていたら Dexie 読み取りは不要。
    //   migrateFromLocalStorage は冪等だが、getAllProfiles + getMeta の
    //   I/O を無駄に 2 回実行してしまうため事前チェック。
    if (useProfilesStore.getState().hasHydrated) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // Step 1-2: 移行 + 掃除
        await migrateFromLocalStorage();
        await cleanupExpiredBackup();

        // Step 3: Dexie 読み取り
        const [dbProfiles, savedTheme, savedCurrentId] = await Promise.all([
          dexieGetAllProfiles(),
          dexieGetMeta(META_KEYS.THEME),
          dexieGetMeta(META_KEYS.CURRENT_PROFILE_ID)
        ]);

        if (cancelled) return;

        // Dexie に profiles があれば ProfileRow を Profile へ (updatedAt を除く)
        if (dbProfiles.length > 0) {
          const restored: Profile[] = dbProfiles.map(({ updatedAt: _, ...p }) => p);
          setProfiles(restored);
        }

        if (savedTheme === 'dark' || savedTheme === 'light') {
          setThemeState(savedTheme);
        }

        // B24 修正 (Critical): 幽霊 currentProfileId の防御
        //   savedCurrentId が dbProfiles に存在するか検証してからセット。
        //   存在しない場合 (別セッションで削除された ID 等) は dbProfiles[0] に
        //   フォールバック、それも無ければセットしない (currentProfile 側の
        //   transient-fallback に任せる)。
        //   これが無いと currentProfileId は 存在しない ID のまま state に残り、
        //   handleToggleMod 等の p.id === currentProfileId 判定で全操作が
        //   silent 失敗する。
        if (savedCurrentId) {
          const validId = dbProfiles.some((p) => p.id === savedCurrentId)
            ? savedCurrentId
            : (dbProfiles[0]?.id ?? null);
          if (validId) {
            setCurrentProfileId(validId);
          }
        }
      } catch (e) {
        // Dexie が使えない環境 (Safari プライベート等) では LocalStorage を直接読む
        console.warn('[DropMod] Dexie 読み取り失敗、LocalStorage にフォールバック:', e);
        try {
          const saved =
            localStorage.getItem(LOCAL_STORAGE_KEYS.CURRENT) ??
            localStorage.getItem(LOCAL_STORAGE_KEYS.LEGACY);
          if (saved) {
            const parsed = JSON.parse(saved);
            const sanitized = sanitizeLoadedStateShim(parsed);
            if (sanitized && !cancelled) {
              if (sanitized.theme) setThemeState(sanitized.theme);
              if (sanitized.profiles && sanitized.profiles.length > 0) {
                setProfiles(sanitized.profiles);
              }
              // B24 修正: LocalStorage フォールバックも同様に存在検証
              if (sanitized.currentProfileId && sanitized.profiles) {
                const validId = sanitized.profiles.some(
                  (p) => p.id === sanitized.currentProfileId
                )
                  ? sanitized.currentProfileId
                  : (sanitized.profiles[0]?.id ?? null);
                if (validId) {
                  setCurrentProfileId(validId);
                }
              }
            }
          }
        } catch (innerErr) {
          console.error('[DropMod] LocalStorage フォールバックも失敗:', innerErr);
        }
      } finally {
        if (!cancelled) setHasHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setThemeState, setProfiles, setCurrentProfileId, setHasHydrated]);

  // ---------------------------------------------------------------------
  // Sub-Phase 8-A: Dexie への保存 (hydration 完了後のみ)
  //
  //   - syncProfiles で追加・更新・削除を差分同期
  //   - meta (theme / currentProfileId) は個別 put
  //   - LocalStorage への並行書き込みも「バックアップ期限内」の間だけ継続
  //     → 7 日以内なら Dexie が壊れても LocalStorage からロールバック可能
  //     → 期限切れ後は cleanupExpiredBackup が消すので、二重書きは自動で止まる
  //
  // 失敗時 (QuotaExceededError 等) は console.warn のみでアプリはクラッシュさせない。
  //
  // B11 修正: 高頻度 setProfiles (bulk Mod 追加等) で Dexie transaction queue が
  //   溜まる問題を防ぐため、500ms debounce をかけて最後の変更のみ書き出す。
  //   setTimeout で timerRef を保持し、次の変更でクリア。
  // ---------------------------------------------------------------------
  const dexieSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasHydrated) return;

    // 既存の pending 書き込みをキャンセル (B11: debounce)
    if (dexieSaveTimerRef.current) {
      clearTimeout(dexieSaveTimerRef.current);
    }

    dexieSaveTimerRef.current = setTimeout(() => {
      // Dexie 保存 (非同期、失敗時はログのみ)
      void (async () => {
        try {
          await dexieSyncProfiles(profiles);
          await Promise.all([
            dexieSetMeta(META_KEYS.THEME, theme),
            dexieSetMeta(META_KEYS.CURRENT_PROFILE_ID, currentProfileId)
          ]);
        } catch (e) {
          console.warn('[DropMod] Dexie への保存に失敗:', e);
        }
      })();

      // LocalStorage への並行バックアップ (バックアップ期限内 or 期限未設定なら)
      // 期限切れ後は cleanupExpiredBackup が meta と LocalStorage を消すので
      // ここでの再作成を避けるため getMeta で確認してから書く。
      void (async () => {
        try {
          const backupExpiry = await dexieGetMeta(META_KEYS.BACKUP_EXPIRES_AT);
          // バックアップ期限が未来 or (レア: hydrate と同時実行で meta 未設定) の場合のみ書く
          if (backupExpiry && Date.now() < Number(backupExpiry)) {
            localStorage.setItem(
              LOCAL_STORAGE_KEYS.CURRENT,
              JSON.stringify({ theme, currentProfileId, profiles })
            );
          }
        } catch (e) {
          // QuotaExceededError 等: 保存できなくてもアプリはクラッシュさせない
          console.warn('[DropMod] LocalStorage バックアップ書き込みに失敗:', e);
        }
      })();
    }, 500);

    return () => {
      // アンマウント / 次の変更でクリア (最新の書き込みを優先)
      if (dexieSaveTimerRef.current) {
        clearTimeout(dexieSaveTimerRef.current);
      }
    };
  }, [hasHydrated, theme, currentProfileId, profiles]);

  // ---------------------------------------------------------------------
  // SSR プロファイル固定によるちらつき解消のため cookie に書き込み
  //
  // Home ページの SSR (Server Component) は cookies() でこの値を読み取り、
  // 実際のユーザープロファイル (LocalStorage 由来) に合わせた初期 24 件を返す。
  // これで hydration 後の再検索によるちらつきが起きなくなる。
  //
  // 書き込むのは mcVersion / loader のみ (SSR 検索に必要な最小情報)。
  // 個人情報や大きなデータは含めない (cookie サイズ制限のため)。
  // ---------------------------------------------------------------------
  // 以前は deps に `profiles` 全体を入れていたため、Mod 追加/削除の
  // たびに cookie 書き込みが発火していた (cookie 内容は mcVersion/loader のみ
  // で変化ないのに)。必要な mcVersion/loader をローカル変数に取り出し、
  // deps を [hasHydrated, mcVersion, loader] のみに限定して過剰実行を防止。
  const currentProfileForCookie = profiles.find((p) => p.id === currentProfileId) || profiles[0];
  const cookieMcVersion = currentProfileForCookie?.environment.mcVersion;
  const cookieLoader = currentProfileForCookie?.environment.loader;
  useEffect(() => {
    if (!hasHydrated) return;
    if (!cookieMcVersion || !cookieLoader) return;
    try {
      const value = encodeURIComponent(
        JSON.stringify({
          mcVersion: cookieMcVersion,
          loader: cookieLoader
        })
      );
      // 1 年間有効、path=/ でサイト全体、SameSite=Lax (通常アクセスで送信)
      // Secure フラグを常時付与。
      //   - 本番 (Vercel) では HTTPS 強制なので必須ではないが、明示することで
      //     セキュリティ姿勢を強化 & 万一 HTTPS でない代替ホスティングにも耐性
      //   - localhost dev はブラウザ仕様上 Secure 要件から除外されるので副作用なし
      // Phase 10-P5 (noDocumentCookie): SSR が cookie 経由で active profile を
      //   読むため client 側 cookie 書き込みが必須。cookieStore API は
      //   Safari 未対応 (2026 時点 experimental) なので document.cookie 直接操作。
      // biome-ignore lint/suspicious/noDocumentCookie: SSR 用 active profile cookie 書き込み (cookieStore は Safari 未対応)
      document.cookie = `dropmod_active_profile=${value}; path=/; max-age=31536000; SameSite=Strict${cookieSecureSuffix()}`;
    } catch (e) {
      console.warn('[DropMod] cookie 書き込みに失敗:', e);
    }
  }, [hasHydrated, cookieMcVersion, cookieLoader]);

  // LocalStorage バックアップ期限切れ後も FOUC しないよう theme を cookie に残す
  useEffect(() => {
    if (!hasHydrated) return;
    try {
      // biome-ignore lint/suspicious/noDocumentCookie: theme FOUC 用 cookie (cookieStore は Safari 未対応)
      document.cookie = `dropmod_theme=${theme}; path=/; max-age=31536000; SameSite=Strict${cookieSecureSuffix()}`;
    } catch (e) {
      console.warn('[DropMod] theme cookie 書き込みに失敗:', e);
    }
  }, [hasHydrated, theme]);

  // 2026-08-27: テーマ meta は debounce を介さず即時保存する。
  // 従来は 500ms debounce 内にリロードすると Dexie に旧テーマが残り、
  // リロード後にテーマが戻ってしまう競合があった (E2E theme-persistence で検出)。
  // テーマ変更はユーザー操作起点で頻度が低く、即時書き込みのコストは無視できる。
  useEffect(() => {
    if (!hasHydrated) return;
    void dexieSetMeta(META_KEYS.THEME, theme).catch(() => {
      /* 保存失敗時も cookie があるため次回起動で復元される */
    });
  }, [hasHydrated, theme]);

  // ---------------------------------------------------------------------
  // profiles が空配列になった場合の安全弁
  //
  // 通常は handleDeleteProfile で「最低1件」を保証しているが、
  // 破損 LocalStorage や外部要因で 0 件になった場合、下の
  //   currentProfile = profiles.find(...) || profiles[0]
  // が undefined になり、その後 currentProfile.mods.length などで
  // アプリ全体が TypeError → 真っ暗になる。
  // ここでフォールバックのデフォルトプロファイルを自動生成して復旧する。
  //
  // B8 修正: React Strict Mode の double-invoke で 2 個の復旧プロファイル
  //   が生成される (uuid が違うので上書きされない) or 復旧 toast が 2 回
  //   出るのを防ぐため、in-flight フラグ (recoveryInFlightRef) で二重実行
  //   を排除する。
  // ---------------------------------------------------------------------
  const recoveryInFlightRef = useRef<boolean>(false);
  useEffect(() => {
    if (!hasHydrated) return;
    if (profiles.length === 0 && !recoveryInFlightRef.current) {
      recoveryInFlightRef.current = true;
      const fallbackProfile: Profile = {
        id: generateId('default-profile-recovered'),
        name: '既定プロファイル',
        environment: { mcVersion: '1.20.1', loader: 'Fabric' },
        description: 'データ復旧により自動生成されたプロファイル',
        mods: []
      };
      setProfiles([fallbackProfile]);
      setCurrentProfileId(fallbackProfile.id);
      showToast('プロファイルが失われたため既定を復旧しました', 'warning');
      // 復旧完了後、少し待ってフラグ解除 (通常 setProfiles 反映後は
      // profiles.length === 1 になるので二重実行はされない)
      queueMicrotask(() => {
        recoveryInFlightRef.current = false;
      });
    }
  }, [profiles.length, hasHydrated, showToast, setProfiles, setCurrentProfileId]);

  // B4 修正: transient fallback を module-level 定数に固定して参照安定化。
  //   従来は render のたびに新規オブジェクト生成 → useEffect deps に
  //   currentProfile を入れている AppShell register useEffect が毎レンダー
  //   発火 → appActionsStore 更新の連鎖に。
  //   fallback は「hydration 完了までの 1 tick」のみ使用される想定なので
  //   固定 object で問題ない (実際の profile は hydration 完了で必ず入る)。
  //
  //   useMemo でラップして、deps (profiles / currentProfileId) が変わらない
  //   限り同一参照を返す。
  const currentProfile: Profile = useMemo(
    () => profiles.find((p) => p.id === currentProfileId) ||
      profiles[0] ||
      TRANSIENT_FALLBACK_PROFILE,
    [profiles, currentProfileId]
  );

  // ------------------------------------------------------------------
  // 全 handle* 関数を useCallback でラップ
  //
  // これらは AppShell の contextValue useMemo の deps に入るため、
  // useCallback しないと毎レンダー新参照 → contextValue も毎レンダー新規
  // → 全 consumer (HomeInteractive / ModsPageClient / SettingsPageClient
  //   / ModDetailModalShell) が毎レンダー再レンダー。
  //
  // 依存性最小化のため、profilesRef.current / currentProfileIdRef.current を
  // 使って最新値を参照する (deps から profiles / currentProfileId を除外可)。
  // showToast / confirmDialog は上位で useCallback 済 (useToasts / useConfirm)。
  // ------------------------------------------------------------------
  const handleSwitchProfile = useCallback(
    (id: string) => {
      setCurrentProfileId(id);
      const p = profilesRef.current.find((x) => x.id === id);
      if (p) showToast(`「${p.name}」に切替`, 'info');
    },
    [showToast, setCurrentProfileId]
  );

  const handleCreateProfile = useCallback(
    async (
      name: string,
      mcVersion: string,
      loader: string,
      description: string,
      mods: ProjectItem[] = [],
      loaderVersion?: string,
      extras?: ProfileContentExtras,
      /**
       * **P12-D1**: 新規プロファイル作成モーダルのフォルダ選択結果。
       * 指定された場合は作成と同時に自動紐付け (read mode) し、§10.5 の
       * artifact 台帳 seed も実行する (Sync の削除判定が成立する)。
       */
      link?: { picked: PickedDirectory; detected: DetectedEnvironment }
    ): Promise<void> => {
      const newId = generateId('profile');

      // --- フォルダ紐付け (D-7: picker は read のまま。昇格は Sync 実行時) ---
      let linkedSource: LinkedSource | undefined;
      if (link) {
        try {
          linkedSource = await linkPickedDirectory(newId, link.picked, link.detected);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          showToast(
            `フォルダの紐付けに失敗したため、プロファイルは作成しませんでした: ${message}`,
            'error'
          );
          return;
        }
      }

      const newProfile: Profile = {
        id: newId,
        name,
        environment: {
          mcVersion,
          loader: normalizeLoader(loader),
          loaderVersion: loaderVersion || undefined
        },
        description,
        mods,
        ...(linkedSource ? { linkedSource } : {}),
        ...(extras?.resourcepacks && extras.resourcepacks.length > 0
          ? { resourcepacks: extras.resourcepacks }
          : {}),
        ...(extras?.shaderpacks && extras.shaderpacks.length > 0
          ? { shaderpacks: extras.shaderpacks }
          : {}),
        ...(extras?.unknownFiles && extras.unknownFiles.length > 0
          ? { unknownFiles: extras.unknownFiles }
          : {})
      };

      // §10.5: Import 由来の artifact を初期 ManagedFileRecord として台帳化。
      // 既存レコード (source / managedAt / syncedAt) は merge で引き継ぐ。
      if (linkedSource) {
        try {
          const existing = await getManagedFiles(newId);
          const records = mergeManagedRecords(expandProfileToManaged(newProfile), existing);
          if (records.length > 0) {
            await syncManagedFiles(newId, records);
          }
        } catch {
          // 台帳 seed 失敗は Profile 作成を止めない (台帳なし = 安全側= 削除対象外)。
          showToast(
            '台帳の初期化に失敗しました。次回の同期で差分が正しく表示されない場合があります。',
            'warning'
          );
        }
      }

      setProfiles((prev) => [...prev, newProfile]);
      setCurrentProfileId(newId);
      showToast(
        `プロファイル「${name}」を作成しました${mods.length > 0 ? ` (${mods.length} 個のMod入り)` : ''}`,
        'success'
      );
    },
    [showToast, setProfiles, setCurrentProfileId]
  );

  const handleDuplicateProfile = useCallback(() => {
    // Ref 経由で最新の currentProfile を取得 (stale closure 回避)
    const latestId = currentProfileIdRef.current;
    const latest =
      profilesRef.current.find((p) => p.id === latestId) || profilesRef.current[0];
    if (!latest) return;
    const newId = generateId('profile');
    const duplicated: Profile = {
      ...latest,
      id: newId,
      name: nextDuplicateName(
        latest.name,
        profilesRef.current.map((p) => p.name)
      ),
      // 2026-08-27 修正: mods 以外の配列 (resourcepacks / shaderpacks /
      // unknownFiles) も deep copy する。浅い参照共有だと複製側で
      // 編集した際に元プロファイルも変わってしまう。
      mods: structuredClone(latest.mods),
      ...(latest.resourcepacks ? { resourcepacks: structuredClone(latest.resourcepacks) } : {}),
      ...(latest.shaderpacks ? { shaderpacks: structuredClone(latest.shaderpacks) } : {}),
      ...(latest.unknownFiles ? { unknownFiles: structuredClone(latest.unknownFiles) } : {})
    };
    setProfiles((prev) => [...prev, duplicated]);
    setCurrentProfileId(newId);
    showToast(`「${duplicated.name}」を作成しました`, 'success');
  }, [showToast, setProfiles, setCurrentProfileId]);

  const handleSaveEditedProfile = useCallback(
    (name: string, mcVersion: string, loader: string, description: string, loaderVersion?: string) => {
      const targetId = currentProfileIdRef.current;
      const before = profilesRef.current.find((p) => p.id === targetId);
      const compatChanged =
        before &&
          (before.environment.mcVersion !== mcVersion ||
            before.environment.loader !== normalizeLoader(loader)) &&
          before.mods.length > 0;

      setProfiles((prev) =>
        prev.map((p) =>
          p.id === targetId
            ? {
                ...p,
                name,
                environment: {
                  ...p.environment,
                  mcVersion,
                  loader: normalizeLoader(loader),
                  loaderVersion: loaderVersion || undefined
                },
                description
              }
            : p
        )
      );
      showToast('プロファイルを更新しました', 'success');
      if (compatChanged) {
        showToast(
          'MC/ローダーを変更しました。「選択中のMod」タブでバージョン再選択を推奨',
          'warning'
        );
      }
    },
    [showToast, setProfiles]
  );

  const handleDeleteProfile = useCallback(
    async (id: string) => {
      if (profilesRef.current.length <= 1) {
        showToast('最低1つのプロファイルが必要です', 'warning');
        return;
      }
      const target = profilesRef.current.find((p) => p.id === id);
      const ok = await confirmDialog({
        title: 'プロファイルを削除しますか？',
        message: `「${target?.name || '(名称未設定)'}」を削除します。\nこの操作は取り消せません。`,
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        danger: true
      });
      if (!ok) return;
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      if (currentProfileIdRef.current === id) {
        const remaining = profilesRef.current.filter((p) => p.id !== id);
        if (remaining[0]) setCurrentProfileId(remaining[0].id);
      }
      showToast('プロファイルを削除しました', 'info');
    },
    [showToast, confirmDialog, setProfiles, setCurrentProfileId]
  );

  const handleToggleMod = useCallback(async (projectId: string, e?: React.MouseEvent, silent = false) => {
    if (e?.stopPropagation) e.stopPropagation();

    // 同一 projectId への並列トグル呼び出しを防止 (連打・重複クリック対策)
    if (toggleInFlightRef.current.has(projectId)) return;
    toggleInFlightRef.current.add(projectId);

    // B10 修正: 削除フローの race 対策。
    //   従来は削除フロー (同期) でも try/finally で lock を即解放していたが、
    //   setProfiles → React の state 反映 → profilesRef.current 更新 の
    //   タイミング race で、2 回目クリックが「まだ削除されていない」と
    //   判定してしまい削除 toast が二重発火する可能性があった。
    //   → 削除完了後の unlock を microtask (queueMicrotask) 経由で遅延させ、
    //     少なくとも 1 tick 待って ref が更新されてから解放する。
    const releaseLock = () => {
      queueMicrotask(() => {
        toggleInFlightRef.current.delete(projectId);
      });
    };

    try {
      // --- Ref 経由で常に最新の profiles / currentProfileId を読む (stale closure 対策) ---
      const latestProfileId = currentProfileIdRef.current;
      const latestProfile =
        profilesRef.current.find((p) => p.id === latestProfileId) || profilesRef.current[0];
      if (!latestProfile) {
        releaseLock();
        return;
      }

      const existsIndex = latestProfile.mods.findIndex(
        (m) => m.projectId === projectId || m.slug === projectId
      );

    if (existsIndex >= 0) {
      // --- 削除 ---
      // 配列アクセスの結果を optional chaining で扱う
      const removed = latestProfile.mods[existsIndex];
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === latestProfileId
            ? {
                ...p,
                mods: p.mods.filter(
                  (m) => m.projectId !== projectId && m.slug !== projectId
                )
              }
            : p
        )
      );
      if (!silent) showToast(`「${removed?.name || 'Mod'}」を削除しました`, 'info');
      // B10 修正: 削除フローは microtask 経由で unlock、race 回避
      releaseLock();
      return;
    } else {
      // --- 追加 ---
      if (!silent) showToast('ModrinthからMod情報を取得中...', 'info');
      try {
        // C7-2 修正: fetchModrinth 直呼びから queryClient.fetchQuery に置換。
        //   - 同じ project ID の 2 回目以降はキャッシュヒットで即返却
        //   - Dexie apiCache persister 経由でオフラインでも取得可能
        //   - staleTime 15 分 (useProjectQuery と同じ)
        const projectPromise = queryClient.fetchQuery({
          queryKey: queryKeys.project(projectId),
          queryFn: ({ signal }) =>
            fetchModrinth<ModrinthProject>(`/project/${projectId}`, undefined, { signal }),
          staleTime: 15 * 60 * 1000
        });

        // 「追加時点で見えているプロファイル」ではなく、
        // fetch 完了時点で最新のプロファイルを基準に version を選ぶ
        // (fetch中にユーザーが mcVersion/loader を変えたケースを吸収)
        const project = await projectPromise;

        const profileAtVersionFetch =
          profilesRef.current.find((p) => p.id === currentProfileIdRef.current) ||
          latestProfile;

        const skipLoader =
          project.project_type === 'resourcepack' || project.project_type === 'shader';
        const versionRes = await fetchStableModVersion(
          projectId,
          {
            loader: profileAtVersionFetch.environment.loader,
            mcVersion: profileAtVersionFetch.environment.mcVersion
          },
          { skipLoader }
        );

        if (
          !versionRes?.targetVersion?.files ||
          versionRes.targetVersion.files.length === 0
        ) {
          if (!silent) showToast('利用可能なファイルが見つかりませんでした', 'warning');
          return;
        }

        const targetVersion = versionRes.targetVersion;
        const primaryFile =
          targetVersion.files.find((f) => f.primary) || targetVersion.files[0];

        // 上で files.length===0 は既に return しているが
        // 配列アクセスの戻り値は T | undefined 型なので明示ガード。
        if (!primaryFile) {
          if (!silent) showToast('利用可能なファイルが見つかりませんでした', 'warning');
          return;
        }

        const modObj: ProjectItem = {
          projectId: project.id,
          slug: project.slug,
          name: project.title,
          description: project.description,
          icon_url: project.icon_url,
          author: project.author || 'Modrinth',
          type: contentCategoryFromProject(project),
          category: primaryCategoryId(project.display_categories, project.categories),
          versionId: targetVersion.id,
          versionNumber: targetVersion.version_number,
          versionType: targetVersion.version_type || 'release',
          fileUrl: primaryFile.url,
          filename: primaryFile.filename
        };

        // --- functional updater 内で「まだ追加されていないか」を再チェック ---
        // API 呼び出し中に別経路で追加されていた場合は二重追加しない。
        let alreadyAdded = false;
        setProfiles((prev) =>
          prev.map((p) => {
            if (p.id !== currentProfileIdRef.current) return p;
            const dup = p.mods.some(
              (m) =>
                m.projectId === project.id || (project.slug && m.slug === project.slug)
            );
            if (dup) {
              alreadyAdded = true;
              return p;
            }
            return { ...p, mods: [...p.mods, modObj] };
          })
        );

        if (!silent) {
          if (alreadyAdded) {
            showToast(`「${project.title}」は既に追加されています`, 'info');
          } else {
            showToast(`「${project.title}」を追加しました！`, 'success');
          }
        }
      } catch {
        // catch binding 省略 (ES2019+): エラー詳細は使わず一律 toast のみ
        if (!silent) showToast('Modの追加に失敗しました', 'warning');
      }
    }
    } finally {
      // B10 修正: 追加フローも microtask 経由で unlock 統一
      releaseLock();
    }
  }, [showToast, setProfiles, queryClient]);

  const applyModVersion = useCallback(
    (projectId: string, versionData: ModrinthVersion, title: string) => {
      const primaryFile =
        versionData.files?.find((f) => f.primary) || versionData.files?.[0];
      if (!primaryFile) return false;
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === currentProfileIdRef.current
            ? {
                ...p,
                mods: p.mods.map((m) =>
                  m.projectId === projectId || m.slug === projectId
                    ? {
                        ...m,
                        versionId: versionData.id,
                        versionNumber: versionData.version_number,
                        versionType: versionData.version_type || 'release',
                        fileUrl: primaryFile.url,
                        filename: primaryFile.filename
                      }
                    : m
                )
              }
            : p
        )
      );
      showToast(`「${title}」を Ver ${versionData.version_number} に更新`, 'success');
      return true;
    },
    [setProfiles, showToast]
  );

  const handleUpdateModVersion = useCallback(
    async (projectId: string, versionId: string, knownVersion?: ModrinthVersion) => {
      const latestProfileId = currentProfileIdRef.current;
      const latestProfile =
        profilesRef.current.find((p) => p.id === latestProfileId) || profilesRef.current[0];
      const mod = latestProfile?.mods.find(
        (m) => m.projectId === projectId || m.slug === projectId
      );
      if (!mod) return;

      if (
        knownVersion &&
        knownVersion.id === versionId &&
        knownVersion.files &&
        knownVersion.files.length > 0
      ) {
        applyModVersion(projectId, knownVersion, mod.name);
        return;
      }

      try {
        // C7-2 修正: fetchModrinth 直呼び → queryClient.fetchQuery で
        //   同じ versionId は 24h キャッシュヒット (Dexie apiCache 永続化)
        const versionData = await queryClient.fetchQuery({
          queryKey: queryKeys.version(versionId),
          queryFn: ({ signal }) =>
            fetchModrinth<ModrinthVersion>(`/version/${versionId}`, undefined, { signal }),
          staleTime: 60 * 60 * 1000 // 1h (version は project より変わりにくい)
        });
        if (versionData?.files && versionData.files.length > 0) {
          applyModVersion(projectId, versionData, mod.name);
        }
      } catch {
        // catch binding 省略 (ES2019+): エラー詳細は使わず一律 toast のみ
        showToast('バージョンの更新に失敗しました', 'warning');
      }
    },
    [showToast, queryClient, applyModVersion]
  );

  const handleRemoveAllMods = useCallback(async (category?: ContentCategory) => {
    const latestId = currentProfileIdRef.current;
    const latest =
      profilesRef.current.find((p) => p.id === latestId) || profilesRef.current[0];
    if (!latest) return;
    const targets = category
      ? latest.mods.filter((m) => contentCategoryOf(m) === category)
      : latest.mods;
    if (targets.length === 0) return;
    const label =
      category === 'resourcepack'
        ? 'Resource Pack'
        : category === 'shader'
          ? 'Shader'
          : 'Mod';
    const ok = await confirmDialog({
      title: `${label}をすべて削除しますか？`,
      message: `プロファイル「${latest.name}」から ${targets.length} 個の${label}を削除します。\\nこの操作は取り消せません。`,
      confirmLabel: 'すべて削除',
      cancelLabel: 'キャンセル',
      danger: true
    });
    if (!ok) return;
    setProfiles((prev) =>
      prev.map((p) =>
        p.id === currentProfileIdRef.current
          ? {
              ...p,
              mods: category
                ? p.mods.filter((m) => contentCategoryOf(m) !== category)
                : []
            }
          : p
      )
    );
    showToast(`すべての${label}を削除しました`, 'info');
  }, [showToast, confirmDialog, setProfiles]);

  const handleRemoveMods = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      const latestId = currentProfileIdRef.current;
      const latest =
        profilesRef.current.find((p) => p.id === latestId) || profilesRef.current[0];
      if (!latest) return;
      const idSet = new Set(ids);
      const targets = latest.mods.filter(
        (m) => idSet.has(m.projectId) || (m.slug != null && idSet.has(m.slug))
      );
      if (targets.length === 0) return;
      const ok = await confirmDialog({
        title: '選択した項目を削除しますか？',
        message: `プロファイル「${latest.name}」から ${targets.length} 個を削除します。\\nこの操作は取り消せません。`,
        confirmLabel: '削除する',
        cancelLabel: 'キャンセル',
        danger: true
      });
      if (!ok) return;
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === currentProfileIdRef.current
            ? {
                ...p,
                mods: p.mods.filter(
                  (m) =>
                    !idSet.has(m.projectId) && !(m.slug != null && idSet.has(m.slug))
                )
              }
            : p
        )
      );
      showToast(`${targets.length} 個を削除しました`, 'info');
    },
    [showToast, confirmDialog, setProfiles]
  );

  return {
    profiles,
    setProfiles,
    currentProfileId,
    setCurrentProfileId,
    currentProfile,
    handleSwitchProfile,
    handleCreateProfile,
    handleDuplicateProfile,
    handleSaveEditedProfile,
    handleDeleteProfile,
    handleToggleMod,
    handleUpdateModVersion,
    handleRemoveAllMods,
    handleRemoveMods
  };
};