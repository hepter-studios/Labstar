import { DotLottieReact, type DotLottie } from "@lottiefiles/dotlottie-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import projectSpaceUrl from "../assets/lottie/space.lottie?url";

const PROJECT_SPACE_SEGMENT: [number, number] = [0, 360];
const PROJECT_SPACE_LAYOUT = { fit: "cover" as const, align: [0.5, 0.5] as [number, number] };

export function ProjectSpaceAnimation() {
  const cleanupRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const renderConfig = useMemo(() => ({
    autoResize: true,
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  }), []);

  const connectPlayer = useCallback((player: DotLottie | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!player) return;

    const markReady = () => {
      setFailed(false);
      setReady(true);
    };
    const markFailed = () => {
      setFailed(true);
      setReady(false);
    };

    player.addEventListener("load", markReady);
    player.addEventListener("play", markReady);
    player.addEventListener("loadError", markFailed);
    player.addEventListener("renderError", markFailed);
    cleanupRef.current = () => {
      player.removeEventListener("load", markReady);
      player.removeEventListener("play", markReady);
      player.removeEventListener("loadError", markFailed);
      player.removeEventListener("renderError", markFailed);
    };
  }, []);

  useEffect(() => () => cleanupRef.current?.(), []);

  return (
    <div
      className={`lottie-project-space-background ${ready ? "ready" : ""} ${failed ? "failed" : ""}`.trim()}
      aria-hidden="true"
    >
      <DotLottieReact
        src={projectSpaceUrl}
        animationId="12345"
        autoplay
        loop
        segment={PROJECT_SPACE_SEGMENT}
        layout={PROJECT_SPACE_LAYOUT}
        renderConfig={renderConfig}
        dotLottieRefCallback={connectPlayer}
      />
    </div>
  );
}

export default ProjectSpaceAnimation;
