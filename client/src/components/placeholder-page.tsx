import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LucideIcon } from "lucide-react";

export function PlaceholderPage({
  title,
  titleEn,
  phase,
  description,
  Icon,
}: {
  title: string;
  titleEn: string;
  phase: string;
  description: string;
  Icon: LucideIcon;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
      <Card className="border-border bg-card p-10 text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-muted">
          <Icon className="h-7 w-7 text-primary" />
        </div>
        <Badge variant="outline" className="mb-4 border-border text-muted-foreground">
          Coming in {phase}
        </Badge>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{titleEn}</p>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </Card>
    </div>
  );
}
