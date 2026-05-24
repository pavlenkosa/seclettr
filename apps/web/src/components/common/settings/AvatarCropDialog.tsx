/**
 * AvatarCropDialog — square crop UI for profile photos.
 *
 * Shows the selected image inside a 300×300 viewport with a circular
 * overlay. The user can drag the image to reposition and use the scroll
 * wheel (or pinch on touch) to scale. On confirm the visible region is
 * rendered to a canvas and returned as a JPEG Blob.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import styles from "./AvatarCropDialog.module.css";

interface AvatarCropDialogProps {
  readonly file: File;
  readonly onConfirm: (blob: Blob) => void;
  readonly onCancel: () => void;
}

const CROP_SIZE = 300; // px — output and viewport square size

export function AvatarCropDialog({ file, onConfirm, onCancel }: AvatarCropDialogProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State: pan offset (of image top-left inside the 300×300 crop square)
  // and scale factor.
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Load the selected file as an Image element.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      // Fit the image to the crop square initially (cover), centered.
      const ratio = Math.max(CROP_SIZE / img.naturalWidth, CROP_SIZE / img.naturalHeight);
      const initScale = ratio;
      const initX = (CROP_SIZE - img.naturalWidth * initScale) / 2;
      const initY = (CROP_SIZE - img.naturalHeight * initScale) / 2;
      setScale(initScale);
      setOffset({ x: initX, y: initY });
      setImageEl(img);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Draw the image on the preview canvas whenever offset/scale/image changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageEl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);
    ctx.drawImage(
      imageEl,
      offset.x,
      offset.y,
      imageEl.naturalWidth * scale,
      imageEl.naturalHeight * scale,
    );
  }, [imageEl, offset, scale]);

  // ── Drag to pan ───────────────────────────────────────────────────────────
  const dragRef = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);

  const clampOffset = useCallback(
    (x: number, y: number, s: number): { x: number; y: number } => {
      if (!imageEl) return { x, y };
      const w = imageEl.naturalWidth * s;
      const h = imageEl.naturalHeight * s;
      // Don't allow dragging so that empty space appears inside the crop area.
      const clampedX = Math.min(0, Math.max(CROP_SIZE - w, x));
      const clampedY = Math.min(0, Math.max(CROP_SIZE - h, y));
      return { x: clampedX, y: clampedY };
    },
    [imageEl],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
    e.preventDefault();
  }, [offset]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setOffset(() => {
        const next = clampOffset(
          dragRef.current!.startOffset.x + dx,
          dragRef.current!.startOffset.y + dy,
          scale,
        );
        return next;
      });
    };
    const onUp = () => { dragRef.current = null; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [scale, clampOffset]);

  // ── Scroll / pinch to zoom ────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (!imageEl) return;
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const minScale = Math.max(CROP_SIZE / imageEl.naturalWidth, CROP_SIZE / imageEl.naturalHeight);
    setScale((prev) => {
      const next = Math.max(minScale, Math.min(4, prev + delta));
      // Recalculate clamp with new scale.
      setOffset((o) => clampOffset(o.x, o.y, next));
      return next;
    });
  }, [imageEl, clampOffset]);

  // ── Touch drag ────────────────────────────────────────────────────────────
  const touchRef = useRef<{ id: number; startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchRef.current = { id: touch.identifier, startX: touch.clientX, startY: touch.clientY, startOffset: offset };
  }, [offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const touch = Array.from(e.touches).find((t) => t.identifier === touchRef.current!.id);
    if (!touch) return;
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;
    setOffset(clampOffset(touchRef.current.startOffset.x + dx, touchRef.current.startOffset.y + dy, scale));
  }, [scale, clampOffset]);

  // ── Confirm: export canvas as JPEG blob ───────────────────────────────────
  const handleConfirm = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (blob) onConfirm(blob);
    }, "image/jpeg", 0.92);
  }, [onConfirm]);

  // Close on Escape.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel]);

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t("profile.cropTitle")}>
      <div className={styles.dialog}>
        <h2 className={styles.title}>{t("profile.cropTitle")}</h2>
        <p className={styles.hint}>{t("profile.cropHint")}</p>

        <div className={styles.viewport}>
          {/* Circle overlay mask — decorative only */}
          <div className={styles.circleMask} aria-hidden="true" />
          <canvas
            ref={canvasRef}
            width={CROP_SIZE}
            height={CROP_SIZE}
            className={styles.canvas}
            onMouseDown={handleMouseDown}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            style={{ cursor: "grab" }}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className={styles.confirmBtn}
            onClick={handleConfirm}
            disabled={imageEl === null}
          >
            {t("profile.cropConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
