import { useCallback, useEffect, useState, type RefObject } from "react";

interface UseGroupCallStageFullscreenOptions {
  stageShellRef: RefObject<HTMLDivElement>;
}

interface UseGroupCallStageFullscreenResult {
  isStageFullscreen: boolean;
  handleToggleStageFullscreen: () => Promise<void>;
}

export function useGroupCallStageFullscreen({
  stageShellRef,
}: UseGroupCallStageFullscreenOptions): UseGroupCallStageFullscreenResult {
  const [isStageFullscreen, setIsStageFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsStageFullscreen(document.fullscreenElement === stageShellRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [stageShellRef]);

  const handleToggleStageFullscreen = useCallback(async () => {
    const stageShell = stageShellRef.current;
    if (!stageShell) return;

    if (document.fullscreenElement === stageShell) {
      if (document.fullscreenEnabled && document.exitFullscreen) {
        await document.exitFullscreen();
      }
      return;
    }

    if (typeof stageShell.requestFullscreen === "function") {
      await stageShell.requestFullscreen();
    }
  }, [stageShellRef]);

  return {
    isStageFullscreen,
    handleToggleStageFullscreen,
  };
}
