const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  queued: { label: "待機中", className: "bg-neutral-200 text-neutral-700" },
  preparing: { label: "準備中", className: "bg-blue-100 text-blue-700" },
  starting: { label: "起動中", className: "bg-blue-100 text-blue-700" },
  running: { label: "実行中", className: "bg-green-100 text-green-700" },
  waiting_permission: { label: "許可待ち", className: "bg-amber-100 text-amber-700" },
  waiting_input: { label: "判断待ち", className: "bg-amber-100 text-amber-700" },
  completed: { label: "完了", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "失敗", className: "bg-red-100 text-red-700" },
  cancel_requested: { label: "停止処理中", className: "bg-orange-100 text-orange-700" },
  cancelled: { label: "停止済み", className: "bg-neutral-200 text-neutral-600" },
  expired: { label: "期限切れ", className: "bg-neutral-200 text-neutral-600" },
  orphaned: { label: "孤立", className: "bg-red-100 text-red-700" },
};

export function JobStatusBadge({ status }: { status: string }) {
  const info = STATUS_LABELS[status] ?? { label: status, className: "bg-neutral-200" };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${info.className}`}>
      {info.label}
    </span>
  );
}
