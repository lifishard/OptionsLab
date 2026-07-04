import { Link, useLocation } from "wouter";
import { Logo } from "./logo";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string }[] = [
  { href: "/greeks", label: "Greeks 教学" },
  { href: "/learn", label: "Learn" },
  { href: "/strategies", label: "策略库" },
  { href: "/builder", label: "组合编辑器" },
  { href: "/scenarios", label: "情景导航" },
  { href: "/copilot", label: "决策副驾" },
  { href: "/chain", label: "期权链" },
  { href: "/stress", label: "压力测试" },
  { href: "/roll", label: "移仓" },
  { href: "/ledger", label: "持仓台账" },
  { href: "/about", label: "关于" },
];

export function Nav() {
  const [location] = useLocation();
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-foreground hover-elevate rounded-md px-1.5 py-1 -mx-1.5"
          data-testid="link-home-logo"
        >
          <Logo className="h-6 w-6 text-primary" />
          <span className="text-sm font-semibold tracking-tight">OptionsLab</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">· 期权实验室</span>
        </Link>

        <nav className="ml-auto flex items-center gap-0.5 overflow-x-auto">
          {LINKS.map((l) => {
            const active = location === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                data-testid={`link-nav-${l.href.slice(1)}`}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover-elevate",
                  active
                    ? "text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
