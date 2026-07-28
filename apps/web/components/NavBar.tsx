import Link from "next/link";

export function NavBar({ title, backHref }: { title: string; backHref?: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-neutral-200 bg-neutral-100/90 p-4 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/90">
      {backHref && (
        <Link href={backHref} className="text-lg" aria-label="戻る">
          ←
        </Link>
      )}
      <h1 className="text-lg font-bold">{title}</h1>
    </header>
  );
}
