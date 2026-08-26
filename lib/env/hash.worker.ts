/**
 * SHA-1 並列計算 Web Worker (PHASE11_PLAN.md §4.6.1, ChatGPT #15)。
 *
 * 大規模環境 (200+ Mods) でメインスレッドの固まりを回避するため、
 * ファイル読み込み後のハッシュ計算を Worker で実行する。
 * コアロジックは hashCore.ts (Worker / メインスレッド共用)。
 */

/// <reference lib="webworker" />
import { hashFiles, type HashTaskInput, type HashResult } from './hashCore';

interface WorkerRequest {
  files: HashTaskInput[];
}

interface WorkerResponse {
  ok: boolean;
  results?: HashResult[];
  error?: string;
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const response: WorkerResponse = { ok: false };
  try {
    const results = await hashFiles(e.data.files);
    response.ok = true;
    response.results = results;
  } catch (error) {
    response.error = error instanceof Error ? error.message : String(error);
  }
  ctx.postMessage(response);
};
