import { useEffect } from "react";

export function useGroupCallDetailsDismiss(
  isDetailsOpen: boolean,
  setIsDetailsOpen: (open: boolean) => void,
) {
  useEffect(() => {
    if (!isDetailsOpen) return;

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Element;
      const drawer = document.getElementById("group-call-details");
      if (drawer?.contains(target)) return;
      if (target.closest("[data-call-details-toggle]")) return;
      setIsDetailsOpen(false);
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isDetailsOpen, setIsDetailsOpen]);
}
