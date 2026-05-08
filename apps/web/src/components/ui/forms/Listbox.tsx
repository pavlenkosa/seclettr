import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useAnimatedPresence } from "@/lib/hooks";
import { MOTION_DURATION_MS } from "@/lib/motion";
import motionStyles from "@/components/ui/motion/Motion.module.css";
import styles from "./Listbox.module.css";

export interface ListboxOption {
  value: string;
  label: string;
}

export interface ListboxProps {
  readonly id?: string;
  readonly value: string;
  readonly options: ListboxOption[];
  readonly onChange: (value: string) => void;
  readonly leading?: ReactNode;
  readonly size?: "md" | "pill";
  readonly disabled?: boolean;
  readonly wrapperClassName?: string;
  readonly "aria-describedby"?: string;
  readonly "aria-label"?: string;
  readonly "aria-labelledby"?: string;
}

interface DropdownPos {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

type ListboxKeyAction =
  | "close"
  | "next"
  | "previous"
  | "select"
  | "first"
  | "last"
  | null;

function shouldOpenFromTrigger(key: string): boolean {
  return key === "Enter" || key === " " || key === "ArrowDown" || key === "ArrowUp";
}

function getListboxKeyAction(key: string): ListboxKeyAction {
  if (key === "Escape") return "close";
  if (key === "ArrowDown") return "next";
  if (key === "ArrowUp") return "previous";
  if (key === "Enter" || key === " ") return "select";
  if (key === "Home") return "first";
  if (key === "End") return "last";
  return null;
}

function getDropdownClassName(isClosing: boolean): string {
  return [
    styles.dropdown,
    isClosing ? motionStyles.popoverOut : motionStyles.popoverIn,
  ].filter(Boolean).join(" ");
}

function getDropdownStyle(pos: DropdownPos): CSSProperties {
  return {
    top: pos.openUp ? undefined : pos.top,
    bottom: pos.openUp ? globalThis.innerHeight - pos.top : undefined,
    left: pos.left,
    width: pos.width,
  };
}

function ChevronIcon({ open }: { readonly open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={[styles.chevronIcon, open ? styles.chevronOpen : ""].filter(Boolean).join(" ")}
    >
      <path
        d="m3.5 5 3.5 4 3.5-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="m2.5 7 3.5 3.5 6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Fully-styled custom listbox that replaces native `<select>`.
 * Renders the dropdown list into a portal to avoid overflow/z-index clipping.
 * Supports full keyboard navigation and ARIA.
 */
export function Listbox({
  id,
  value,
  options,
  onChange,
  leading,
  size = "md",
  disabled = false,
  wrapperClassName = "",
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: ListboxProps) {
  const uid = useId();
  const triggerId = id ?? uid;
  const listId = `${triggerId}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [pos, setPos] = useState<DropdownPos | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedLabel = options[selectedIndex]?.label ?? value;
  const dropdownPresence = useAnimatedPresence({
    isOpen,
    durationMs: MOTION_DURATION_MS.fast,
  });

  // Compute dropdown position relative to trigger
  const computePos = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = globalThis.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const DROPDOWN_MAX_HEIGHT = 260;
    const openUp = spaceBelow < DROPDOWN_MAX_HEIGHT && spaceAbove > spaceBelow;
    setPos({
      top: openUp ? rect.top : rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  }, []);

  const open = useCallback(() => {
    if (disabled) return;
    computePos();
    setIsOpen(true);
    setActiveIndex(Math.max(selectedIndex, 0));
  }, [disabled, computePos, selectedIndex]);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
    triggerRef.current?.focus();
  }, []);

  const select = useCallback(
    (optValue: string) => {
      onChange(optValue);
      close();
    },
    [onChange, close],
  );

  // Focus the list container after it mounts so keyboard nav works immediately
  useEffect(() => {
    if (isOpen && listRef.current) {
      listRef.current.focus();
    }
  }, [isOpen]);

  // Scroll active item into view inside the list
  useEffect(() => {
    if (!isOpen || activeIndex < 0 || !listRef.current) return;
    const item = listRef.current.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [isOpen, activeIndex]);

  // Close on outside click / focus loss
  useEffect(() => {
    if (!isOpen) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (listRef.current?.contains(target)) return;
      close();
    }
    function onScroll() {
      computePos();
    }
    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    globalThis.addEventListener("scroll", onScroll, { passive: true, capture: true });
    globalThis.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      globalThis.removeEventListener("scroll", onScroll, { capture: true });
      globalThis.removeEventListener("resize", onScroll);
    };
  }, [isOpen, close, computePos]);

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (shouldOpenFromTrigger(e.key)) {
      e.preventDefault();
      open();
    }
  }

  function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const action = getListboxKeyAction(e.key);
    if (!action) {
      return;
    }

    e.preventDefault();
    if (action === "close") close();
    if (action === "next") setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    if (action === "previous") setActiveIndex((i) => Math.max(i - 1, 0));
    if (action === "select" && activeIndex >= 0) select(options[activeIndex]!.value);
    if (action === "first") setActiveIndex(0);
    if (action === "last") setActiveIndex(options.length - 1);
  }

  const dropdown =
    dropdownPresence.isMounted && pos
      ? createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            tabIndex={0}
            aria-label={ariaLabel}
            aria-activedescendant={activeIndex >= 0 ? `${listId}-opt-${activeIndex}` : undefined}
            className={getDropdownClassName(dropdownPresence.isClosing)}
            style={getDropdownStyle(pos)}
            onKeyDown={onListKeyDown}
          >
            {options.map((opt, i) => (
              <div
                key={opt.value}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={opt.value === value}
                data-index={i}
                className={[
                  styles.option,
                  opt.value === value ? styles.optionSelected : "",
                  i === activeIndex ? styles.optionActive : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onPointerDown={(e) => {
                  e.preventDefault(); // prevent blur on trigger
                  select(opt.value);
                }}
                onPointerEnter={() => setActiveIndex(i)}
              >
                <span className={styles.optionLabel}>{opt.label}</span>
                {opt.value === value ? (
                  <span className={styles.optionCheck}>
                    <CheckIcon />
                  </span>
                ) : null}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={triggerId}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={dropdownPresence.isMounted ? listId : undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={isOpen ? close : open}
        onKeyDown={onTriggerKeyDown}
        className={[
          styles.trigger,
          styles[size],
          isOpen ? styles.triggerOpen : "",
          wrapperClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {leading ? <span className={styles.leading} aria-hidden="true">{leading}</span> : null}
        <span className={styles.triggerValue}>{selectedLabel}</span>
        <span className={styles.chevron}>
          <ChevronIcon open={isOpen} />
        </span>
      </button>
      {dropdown}
    </>
  );
}
