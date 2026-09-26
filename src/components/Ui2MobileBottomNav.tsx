import { BarChart3, Compass, Target, User, ListTodo } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

const items = [
  { label: "Journey", path: "/journey", icon: Compass },
  { label: "Goals", path: "/my-goals", icon: Target },
  { label: "Today", path: "/todo", icon: ListTodo },
  { label: "Progress", path: "/progress", icon: BarChart3 },
  { label: "Profile", path: "/profile", icon: User },
];

export function Ui2MobileBottomNav() {
  const location = useLocation();

  return (
    <nav
      aria-label="GOALS app navigation"
      className="ui2-mobile-bottom-nav fixed inset-x-3 bottom-3 z-[60] md:hidden"
    >
      <div className="grid grid-cols-5 items-center rounded-[1.35rem] border border-border/70 bg-background/92 p-1.5 shadow-[0_24px_70px_-34px_hsl(var(--color-primary-dark)/0.56)] backdrop-blur-xl">
        {items.map((item) => {
          const active =
            location.pathname === item.path ||
            (item.path === "/todo" && location.pathname === "/plan");
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={active ? "page" : undefined}
              className={
                "flex min-h-[3.35rem] flex-col items-center justify-center gap-1 rounded-[1rem] px-1 text-[0.67rem] font-semibold transition-colors " +
                (active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground")
              }
            >
              <Icon className="h-[1.15rem] w-[1.15rem]" strokeWidth={1.9} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
