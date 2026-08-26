/**
 * カスタム Vitest テスト環境: 「jsdom + Node ネイティブ AbortController/AbortSignal」
 *
 * 背景 (Node 24 対応、2026-08-26):
 *   vitest 3.x の jsdom 環境は populateGlobal() で globalThis の
 *   AbortController / AbortSignal を jsdom 実装で上書きする
 *   (LIVING_KEYS に含まれるため)。一方 Node 24 (undici v7) のネイティブ
 *   fetch は RequestInit.signal を「同一 realm の AbortSignal」か厳格に検証し、
 *   jsdom 由来の signal を渡すと
 *   `RequestInit: Expected signal ("AbortSignal {}") to be an instance of
 *   AbortSignal.` で fetch 全体が失敗する (Node 22 の undici は受け入れる)。
 *
 *   → TanStack Query のキャンセル signal / hooks の AbortController が
 *     fetch に届く全テストが Node 24 で失敗していた。
 *
 *   上流バグ: https://github.com/vitest-dev/vitest/issues/8374
 *   上流修正 (vitest 4 で LIVING_KEYS から除外): https://github.com/vitest-dev/vitest/pull/8390
 *
 * 本環境のやること:
 *   1. 内蔵 jsdom 環境の setup をそのまま呼ぶ (environmentOptions.jsdom も解釈される)
 *   2. **populateGlobal 実行後** に AbortController / AbortSignal を
 *      セットアップ開始時に捕獲しておいた Node ネイティブ実装に差し戻す
 *
 *   populateGlobal は各キーに getter/setter を定義しており、setter は
 *   overrideObject に値を登録、getter は overrideObject を最優先で返す。
 *   そのため後から代入したネイティブ実装が LIVING_KEYS 同期に上書きされず
 *   恒久的に有効になる (teardown では originals から元値が復元される)。
 *
 * vitest 4 へのアップグレード時に本ファイルは不要になる
 * (上流で修正されるため、environment を 'jsdom' に戻して削除する)。
 */

import { builtinEnvironments } from 'vitest/environments';

export default {
  name: 'jsdom-native-abort',
  transformMode: 'web',
  async setup(global: typeof globalThis, options: Record<string, unknown>) {
    // ① populateGlobal 実行前 = まだ Node ネイティブ実装
    const NativeAbortController = global.AbortController;
    const NativeAbortSignal = global.AbortSignal;

    // ② 内蔵 jsdom 環境に委譲 (JSDOM 構築 + global への populate)
    const env = await builtinEnvironments.jsdom.setup(global, options);

    // ③ jsdom 実装で上書きされた 2 グローバルだけ Node ネイティブに差し戻す
    //    (overrideObject 経由で登録されるため以後の参照はすべてネイティブ版)
    global.AbortController = NativeAbortController;
    global.AbortSignal = NativeAbortSignal;

    return env;
  }
};
