import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Parse a yyyy-mm-dd string → Date (local midnight). Returns null on failure. */
function parseISO(iso: string): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Format a Date → yyyy-mm-dd */
function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format a Date → "1 Jan 2026" */
function toDisplay(d: Date): string {
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Return an array of Date cells (including leading/trailing blanks as null) for the calendar grid. */
function buildCalendarGrid(year: number, month: number): (Date | null)[] {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];

  // Leading blanks
  for (let i = 0; i < firstDay; i++) cells.push(null);

  // Days
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  // Trailing blanks to fill last row
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface DatePickerProps {
  id?: string;
  /** ISO string yyyy-mm-dd */
  value: string;
  disabled?: boolean;
  onChange: (iso: string) => void;
  placeholder?: string;
}

export function DatePicker({
  id,
  value,
  disabled = false,
  onChange,
  placeholder = "Select a date",
}: DatePickerProps) {
  const selectedDate = parseISO(value);
  const today = new Date();

  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    selectedDate?.getFullYear() ?? today.getFullYear()
  );
  const [viewMonth, setViewMonth] = useState(
    selectedDate?.getMonth() ?? today.getMonth()
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  }

  function selectDay(date: Date) {
    onChange(toISO(date));
    setOpen(false);
  }

  function goToday() {
    onChange(toISO(today));
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setOpen(false);
  }

  function clearDate() {
    onChange("");
  }

  const cells = buildCalendarGrid(viewYear, viewMonth);

  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();

  const isSelected = (d: Date) =>
    !!selectedDate &&
    d.getFullYear() === selectedDate.getFullYear() &&
    d.getMonth() === selectedDate.getMonth() &&
    d.getDate() === selectedDate.getDate();

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Trigger button ── */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={[
          "w-full flex items-center gap-2 rounded-lg border px-3 py-2",
          "text-[13px] text-left transition-all duration-150",
          "outline-none focus-visible:ring-2 focus-visible:ring-[#4F5BD9]/30",
          open
            ? "border-[#4F5BD9] bg-white shadow-[0_0_0_3px_rgba(79,91,217,0.08)]"
            : "border-[#E4E4E7] bg-[#FAFAFA] hover:border-[#C4C4C8] hover:bg-white",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
        ].join(" ")}
      >
        <Calendar
          className={`h-3.5 w-3.5 shrink-0 ${selectedDate ? "text-[#4F5BD9]" : "text-[#A1A1AA]"}`}
          strokeWidth={1.75}
        />
        <span className={selectedDate ? "text-[#18181B] font-medium" : "text-[#A1A1AA]"}>
          {selectedDate ? toDisplay(selectedDate) : placeholder}
        </span>
      </button>

      {/* ── Floating calendar panel ── */}
      {open && (
        <div
          role="dialog"
          aria-label="Date picker"
          className={[
            "absolute z-50 mt-1.5 w-[268px]",
            "rounded-xl border border-[#E4E4E7] bg-white",
            "shadow-[0_8px_30px_rgba(0,0,0,0.10),0_2px_8px_rgba(0,0,0,0.06)]",
            "overflow-hidden",
            // Position: prefer below, but flip up when near bottom
            "top-full left-0",
          ].join(" ")}
        >
          {/* Month / Year header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#F4F4F5]">
            <button
              type="button"
              onClick={prevMonth}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#18181B] transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2} />
            </button>

            <span className="text-[13px] font-semibold text-[#18181B] tracking-[-0.01em]">
              {MONTHS[viewMonth]} {viewYear}
            </span>

            <button
              type="button"
              onClick={nextMonth}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#71717A] hover:bg-[#F4F4F5] hover:text-[#18181B] transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>

          {/* Day-of-week labels */}
          <div className="grid grid-cols-7 px-3 pt-2.5 pb-1">
            {DAYS.map((d) => (
              <div
                key={d}
                className="text-center text-[11px] font-medium text-[#A1A1AA] py-0.5"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 px-3 pb-2.5 gap-y-0.5">
            {cells.map((date, i) => {
              if (!date) {
                return <div key={`blank-${i}`} />;
              }

              const sel = isSelected(date);
              const tod = isToday(date);

              return (
                <button
                  key={toISO(date)}
                  type="button"
                  onClick={() => selectDay(date)}
                  className={[
                    "relative mx-auto flex h-8 w-8 items-center justify-center",
                    "rounded-full text-[12.5px] transition-all duration-100",
                    sel
                      ? "bg-[#18181B] text-white font-semibold shadow-sm"
                      : tod
                      ? "text-[#4F5BD9] font-semibold"
                      : "text-[#3F3F46] hover:bg-[#F4F4F5]",
                  ].join(" ")}
                  aria-label={toDisplay(date)}
                  aria-pressed={sel}
                >
                  {date.getDate()}
                  {/* Today dot — only when not selected */}
                  {tod && !sel && (
                    <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-[#4F5BD9]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-between border-t border-[#F4F4F5] px-4 py-2.5">
            <button
              type="button"
              onClick={clearDate}
              className="text-[12px] font-medium text-[#71717A] hover:text-[#18181B] transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={goToday}
              className="text-[12px] font-medium text-[#4F5BD9] hover:text-[#3B47C0] transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
