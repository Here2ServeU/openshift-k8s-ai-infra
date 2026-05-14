import { cn } from "@/lib/utils";

export type Column<T> = {
  key: keyof T | string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  width?: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  highlight,
  empty = "No rows.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  highlight?: (r: T) => boolean;
  empty?: string;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[0.8125rem]">
          <thead>
            <tr className="text-left">
              {columns.map((c, i) => (
                <th
                  key={i}
                  className={cn(
                    "caption px-4 py-3 font-medium",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                  )}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
            <tr>
              <td colSpan={columns.length} className="hairline p-0" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-ink-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const hi = highlight?.(r);
                return (
                  <tr
                    key={rowKey(r)}
                    className={cn(
                      "group border-b border-border-subtle/60 transition-colors last:border-b-0 hover:bg-elevated/60",
                      hi && "accent-row",
                    )}
                  >
                    {columns.map((c, i) => (
                      <td
                        key={i}
                        className={cn(
                          "px-4 py-3 align-top",
                          c.align === "right" && "text-right",
                          c.align === "center" && "text-center",
                          c.className,
                        )}
                      >
                        {c.render
                          ? c.render(r)
                          : (r as Record<string, unknown>)[c.key as string] as React.ReactNode}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
