"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * サーバーコンポーネントの内容を定期的に再取得する。
 * ジョブ実行中の状態変化(queued→running→completed等)を
 * リロードなしで画面へ反映するために使う。
 */
export function AutoRefresh({
  intervalMs = 3000,
  enabled = true,
}: {
  intervalMs?: number;
  enabled?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, router]);
  return null;
}
