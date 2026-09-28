import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function Ui2PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  actions?: ReactNode;
}) {
  return (
    <header className="ui2-page-header mb-7 overflow-hidden rounded-[1.5rem] border border-border/70 bg-card px-5 py-6 shadow-[0_24px_70px_-42px_hsl(var(--color-primary-dark)/0.46)] sm:px-7 sm:py-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 max-w-4xl">
          <div className="mb-3 flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.16em] text-primary">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-4 w-4" strokeWidth={1.9} />
            </span>
            {eyebrow}
          </div>
          <h1 className="text-3xl font-bold tracking-[-0.035em] text-foreground sm:text-4xl lg:text-[2.7rem] lg:leading-[1.04]">
            {title}
          </h1>
          {description && (
            <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
