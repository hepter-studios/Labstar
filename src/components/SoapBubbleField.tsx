import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

type SoapBubble = {
  delay: number;
  duration: number;
  id: number;
  left: number;
  popping: boolean;
  scaleOne: number;
  scaleTwo: number;
  size: number;
  tint: string;
  top: number;
  xOne: number;
  xTwo: number;
  yOne: number;
  yTwo: number;
};

type DragState = {
  bubbleId: number;
  element: HTMLSpanElement;
  moved: boolean;
  originLeft: number;
  originTop: number;
  pointerId: number;
  startX: number;
  startY: number;
};

const SOAP_TINTS = [
  "rgba(255, 193, 222, .5)",
  "rgba(166, 215, 255, .52)",
  "rgba(210, 187, 255, .5)",
  "rgba(177, 243, 218, .46)",
  "rgba(255, 226, 170, .44)",
];

const SOAP_SLOTS = [
  { left: 9, top: 12 },
  { left: 69, top: 9 },
  { left: 22, top: 57 },
  { left: 73, top: 58 },
  { left: 47, top: 32 },
];

let nextBubbleId = 1;

function between(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createBubble(index = 0): SoapBubble {
  const slot = SOAP_SLOTS[index % SOAP_SLOTS.length];

  return {
    delay: between(-13, -1),
    duration: between(12, 20),
    id: nextBubbleId++,
    left: slot.left + between(-4, 4),
    popping: false,
    scaleOne: between(.9, 1.12),
    scaleTwo: between(.9, 1.1),
    size: between(82, 146),
    tint: SOAP_TINTS[index % SOAP_TINTS.length],
    top: slot.top + between(-5, 5),
    xOne: between(-28, 28),
    xTwo: between(-28, 28),
    yOne: between(-24, 24),
    yTwo: between(-24, 24),
  };
}

export function SoapBubbleField() {
  const [bubbles, setBubbles] = useState<SoapBubble[]>(() =>
    Array.from({ length: 5 }, (_, index) => createBubble(index)),
  );
  const fieldRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const timersRef = useRef<number[]>([]);
  const filterId = `labstar-soap-${useId().replace(/:/g, "")}`;

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useLayoutEffect(() => {
    const field = fieldRef.current;
    const scrollViewport = field?.parentElement?.parentElement;
    if (!field || !(scrollViewport instanceof HTMLElement)) return undefined;
    const syncHeight = () => {
      field.style.height = `${Math.max(1, scrollViewport.clientHeight)}px`;
    };
    const observer = new ResizeObserver(syncHeight);
    observer.observe(scrollViewport);
    syncHeight();
    return () => observer.disconnect();
  }, []);

  function popBubble(bubbleId: number) {
    setBubbles((current) => current.map((bubble) => (
      bubble.id === bubbleId ? { ...bubble, popping: true } : bubble
    )));
    const timer = window.setTimeout(() => {
      setBubbles((current) => [
        ...current.filter((bubble) => bubble.id !== bubbleId),
        createBubble(Math.floor(Math.random() * SOAP_TINTS.length)),
      ]);
    }, 900 + Math.random() * 500);
    timersRef.current.push(timer);
  }

  function beginDrag(event: ReactPointerEvent<HTMLSpanElement>, bubbleId: number) {
    if (event.button !== 0 || !fieldRef.current) return;
    const fieldRect = fieldRef.current.getBoundingClientRect();
    const bubbleRect = event.currentTarget.getBoundingClientRect();
    const visualLeft = bubbleRect.left - fieldRect.left;
    const visualTop = bubbleRect.top - fieldRect.top;

    event.preventDefault();
    event.currentTarget.style.left = `${visualLeft}px`;
    event.currentTarget.style.top = `${visualTop}px`;
    event.currentTarget.style.animation = "none";
    event.currentTarget.style.transform = "none";
    event.currentTarget.classList.add("is-dragging");
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      bubbleId,
      element: event.currentTarget,
      moved: false,
      originLeft: visualLeft,
      originTop: visualTop,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  }

  function moveBubble(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    const field = fieldRef.current;
    if (!drag || !field || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 6) drag.moved = true;
    if (!drag.moved) return;

    const maxLeft = Math.max(0, field.clientWidth - drag.element.offsetWidth);
    const maxTop = Math.max(0, field.clientHeight - drag.element.offsetHeight);
    drag.element.style.left = `${Math.max(0, Math.min(maxLeft, drag.originLeft + deltaX))}px`;
    drag.element.style.top = `${Math.max(0, Math.min(maxTop, drag.originTop + deltaY))}px`;
  }

  function finishDrag(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try {
      drag.element.releasePointerCapture(event.pointerId);
    } catch {
      // O ponteiro pode ter sido liberado pelo navegador ao sair da janela.
    }
    drag.element.classList.remove("is-dragging");
    drag.element.classList.toggle("is-placed", drag.moved);
    dragRef.current = null;
    if (!drag.moved) popBubble(drag.bubbleId);
  }

  return (
    <div className="labstar-soap-layer" aria-hidden="true">
      <svg className="labstar-neu-effect-defs" focusable="false">
        <defs>
          <filter id={filterId} x="-22%" y="-22%" width="144%" height="144%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0
                      0 1 0 0 0
                      0 0 1 0 0
                      0 0 0 16 -6"
              result="goo"
            />
            <feComposite in="SourceGraphic" in2="goo" operator="over" />
          </filter>
        </defs>
      </svg>
      <div
        ref={fieldRef}
        className="labstar-soap-field"
        style={{ "--soap-filter": `url(#${filterId})` } as CSSProperties}
      >
        {bubbles.map((bubble) => (
          <span
            key={bubble.id}
            className={`labstar-soap-bubble ${bubble.popping ? "is-popping" : ""}`}
            style={{
              "--soap-delay": `${bubble.delay.toFixed(1)}s`,
              "--soap-duration": `${bubble.duration.toFixed(1)}s`,
              "--soap-s1": bubble.scaleOne.toFixed(2),
              "--soap-s2": bubble.scaleTwo.toFixed(2),
              "--soap-tint": bubble.tint,
              "--soap-tx1": `${bubble.xOne.toFixed(0)}px`,
              "--soap-tx2": `${bubble.xTwo.toFixed(0)}px`,
              "--soap-ty1": `${bubble.yOne.toFixed(0)}px`,
              "--soap-ty2": `${bubble.yTwo.toFixed(0)}px`,
              height: `${bubble.size.toFixed(0)}px`,
              left: `${bubble.left.toFixed(1)}%`,
              top: `${bubble.top.toFixed(1)}%`,
              width: `${bubble.size.toFixed(0)}px`,
            } as CSSProperties}
            onPointerDown={(event) => beginDrag(event, bubble.id)}
            onPointerMove={moveBubble}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
          />
        ))}
      </div>
    </div>
  );
}
