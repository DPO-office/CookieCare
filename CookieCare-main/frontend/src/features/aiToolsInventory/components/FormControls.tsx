import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

export function PremiumSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const selected = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="inv-field relative">
      <button
        type="button"
        className={`inv-control ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected?.label ?? "Select"}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-[#98A2B3] transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
        />
      </button>
      {open && (
        <ul className="inv-menu" role="listbox">
          {options.map((o) => {
            const active = o.id === value;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`inv-option ${active ? "is-active" : ""}`}
                  onClick={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function toIsoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(iso: string | null): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDisplay(iso: string | null) {
  const d = parseIso(iso);
  if (!d) return "";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function PremiumDateField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const [cursor, setCursor] = useState(() => selected ?? new Date());
  const ref = useDismiss(open, () => setOpen(false));

  useEffect(() => {
    if (open) setCursor(selected ?? new Date());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const cells = useMemo(() => {
    const first = startOfMonth(cursor);
    const lead = first.getDay();
    const count = daysInMonth(cursor);
    const out: { date: Date; current: boolean }[] = [];
    for (let i = 0; i < lead; i++) {
      const d = new Date(first);
      d.setDate(i - lead + 1);
      out.push({ date: d, current: false });
    }
    for (let i = 1; i <= count; i++) {
      out.push({ date: new Date(cursor.getFullYear(), cursor.getMonth(), i), current: true });
    }
    while (out.length % 7 !== 0) {
      const last = out[out.length - 1].date;
      const d = new Date(last);
      d.setDate(d.getDate() + 1);
      out.push({ date: d, current: false });
    }
    return out;
  }, [cursor]);

  const todayIso = toIsoDate(new Date());
  const selectedIso = value;

  return (
    <div ref={ref} className="inv-field relative">
      <button
        type="button"
        className={`inv-control ${open ? "is-open" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={selectedIso ? "" : "text-[#98A2B3]"}>
          {formatDisplay(selectedIso) || "Select date"}
        </span>
        <Calendar className="h-3.5 w-3.5 shrink-0 text-[#98A2B3]" strokeWidth={1.75} />
      </button>
      {open && (
        <div className="inv-cal">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] font-semibold tracking-[-0.02em] text-[#1a1a1a]">
              {cursor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                className="inv-cal-nav"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="inv-cal-nav"
                onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                aria-label="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mb-1 grid grid-cols-7">
            {WEEKDAYS.map((d) => (
              <span
                key={d}
                className="py-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-[#98A2B3]"
              >
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map(({ date, current }) => {
              const iso = toIsoDate(date);
              const isSel = iso === selectedIso;
              const isToday = iso === todayIso;
              return (
                <button
                  key={iso}
                  type="button"
                  className={`inv-cal-day ${current ? "" : "is-muted"} ${isSel ? "is-selected" : ""} ${
                    isToday && !isSel ? "is-today" : ""
                  }`}
                  onClick={() => {
                    onChange(iso);
                    setOpen(false);
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-[rgba(16,24,40,0.06)] pt-2.5">
            <button
              type="button"
              className="text-[12px] font-medium text-[#98A2B3] transition-colors hover:text-[#1a1a1a]"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-[12px] font-semibold text-[#4F5BD9] hover:text-[#3d48c7]"
              onClick={() => {
                onChange(todayIso);
                setOpen(false);
              }}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
