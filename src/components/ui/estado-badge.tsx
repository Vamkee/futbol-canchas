import { ESTADO_META } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { ReservaEstado } from "@/types";

export function EstadoBadge({ estado }: { estado: ReservaEstado }) {
  const meta = ESTADO_META[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        meta.badge
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}