import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import type { ToolCall } from "./resolve";
import {
  addDisplayedTool,
  removeDisplayedTool,
  takePendingIconRect,
  wasJustClicked,
} from "./morph-state";
import { TOOLS } from "./tools";

// Ported from apps/ssr-agent/app/widget-morph.tsx -- the FLIP animation
// engine itself has zero Next.js/RSC coupling (confirmed: hand-rolled via
// the Web Animations API, ResizeObserver, and plain DOM measurement), so
// this file is unchanged apart from the ToolCall import path. The
// ResizeObserver-driven height-catch-up effect below still matters here
// even though nothing re-suspends the way ssr-agent's RSC/Suspense content
// did -- apps/agent-tools's widgets are plain sync components with no
// swap-in-place moment of their own, but keeping this effect costs nothing
// and keeps this file a true port rather than a divergent copy.

const DURATION = 650;
const EASING = "cubic-bezier(.2,.8,.2,1)";
// How far along the whole travel (as a fraction of DURATION) the box
// stays sized like the small tray glyph before growing/shrinking into
// its full widget size. A plain CSS `transition` can only interpolate
// smoothly between exactly two values across the WHOLE duration, which
// read as the shape "linearly" ballooning the entire way there. What
// was actually wanted is for the box to still look like the icon for
// almost the whole trip and only pop into the widget's shape right at
// the very end -- a hold-then-snap curve, not a smooth ramp. That needs
// an explicit third keyframe partway through, which is exactly what the
// Web Animations API's `element.animate()` gives us (see flipWidget)
// and a CSS transition cannot: width/height/border-radius keyframes sit
// at 0 and HOLD_FRACTION with the SAME (icon) values, then move to the
// target values only between HOLD_FRACTION and 1. Position
// (offset-distance) has no such hold -- it keeps moving the entire
// duration, so the icon-sized box visibly travels the whole path before
// unfurling at the end.
const HOLD_FRACTION = 0.8;

// The box stays clipped to icon size (overflow-hidden) until the shape
// animation actually pops it to full size, at HOLD_FRACTION * DURATION --
// any content fade-in that starts before that point is invisible, clipped
// away with the rest of the box's interior. Starting the fade here instead
// of some earlier fixed delay means the full fade duration actually plays
// out once content is visible, instead of mostly finishing off-screen and
// reading as an abrupt pop (confirmed: that's exactly what a flat 350ms
// delay did here before -- ~170ms of a 250ms fade happened while still
// clipped, leaving only an 80ms tail visible).
const CONTENT_FADE_DELAY = HOLD_FRACTION * DURATION;
const CONTENT_FADE_DURATION = 250;

// Before it leaves the tray, the icon "pops": it swells a little and its
// border thickens and darkens, so the eye is on the right icon when it
// takes off. POP_IN_MS to swell (an animation the eye can follow, on an
// easeInOutBack curve), held until POP_MS, when the flight
// starts; it settles back to normal over the flight's first POP_OUT_MS.
const POP_IN_MS = 220;
const POP_MS = 300;
const POP_OUT_MS = 160;
const POP_SCALE = 1.16;

// The corner badge's resting geometry, matching its Tailwind classes
// below (`right-20 top-4 h-12 w-12 text-xl`) -- kept as named constants
// because the animation drives these same properties via inline styles,
// so the two need to agree in pixels, not just in class names. 1rem is
// assumed 16px (this app's default root font size).
const BADGE_INSET = 16; // top-4
// Further in from the right edge than from the top: the corner itself
// belongs to the pin and close buttons (see the `action` prop).
const BADGE_RIGHT = 80; // right-20
const BADGE_SIZE = 48; // h-12 / w-12
const BADGE_FONT_SIZE = 20; // text-xl
const ICON_FONT_SIZE = 18; // tray button's own text-lg

type BadgeGeom = { top: number; right: number; size: number; fontSize: number };

// The badge's geometry when it's occupying a tray icon's spot: filling
// the box completely (no inset), sized to match, at the tray button's
// own font size -- i.e. indistinguishable from the plain tray icon.
// The tray icon's own border, and the box's while it is icon-sized.
const ICON_BORDER = 1;

function iconBadgeGeom(iconRect: DOMRect): BadgeGeom {
  return {
    // The glyph is positioned inside the box's border, but has to be
    // centred on the whole icon-sized box: pull it back out by the border
    // on both sides, or it sits a pixel off the tray icon's own glyph.
    top: -ICON_BORDER,
    right: -ICON_BORDER,
    size: iconRect.height,
    fontSize: ICON_FONT_SIZE,
  };
}

const WIDGET_BADGE_GEOM: BadgeGeom = {
  top: BADGE_INSET,
  right: BADGE_RIGHT,
  size: BADGE_SIZE,
  fontSize: BADGE_FONT_SIZE,
};

// A cubic-bezier "hook" from (dx, dy) to (0, 0), for use as an
// `offset-path`: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Motion_path.
// `offset-distance: 0%` sits at the path's start (dx, dy); 100% sits at
// its end (0, 0) -- i.e. wherever the element's own top/left already
// puts it.
//
// A single quadratic bezier (one control point) can only bow the line
// one way. A cubic bezier's two independent control points can pull the
// early direction one way (down-and-left, regardless of the destination)
// and hook the back half sharply toward the destination from a different
// angle -- "dip down-left, then hook right", not a single gentle arc.
function buildArcPath(dx: number, dy: number): string {
  const distance = Math.hypot(dx, dy) || 1;
  const c1x = dx - distance * 0.85;
  const c1y = dy + distance * 0.85;
  const c2x = distance * 0.5;
  const c2y = -distance * 0.5;
  return `path('M ${dx} ${dy} C ${c1x} ${c1y}, ${c2x} ${c2y}, 0 0')`;
}

// Only resets styles this file ever writes directly as inline styles.
// width/height/border-radius (box) and top/right/width/height/font-size
// (badge) are no longer among them -- flipWidget drives those entirely
// via Web Animations API effects now, which live in their own layer
// above inline styles/CSS and don't need (or respond to) clearing here.
// Cancelling those Animation objects is what releases them; see
// flipWidget's settle().
// Builds the shared "hold most of the trip, snap for the rest" keyframe
// shape used by both the box's size and the badge's geometry, mirrored
// for growing vs. shrinking (see flipWidget's `growing` param). The
// per-keyframe `easing` (rather than a top-level one) is deliberate --
// see the comment where this is called for why a top-level easing here
// would warp real-time offsets away from what HOLD_FRACTION says.
function holdThenSnapKeyframes<T extends Record<string, string>>(
  from: T,
  to: T,
  growing: boolean
): (T & { offset: number; easing?: string })[] {
  if (growing) {
    return [
      { ...from, offset: 0 },
      { ...from, offset: HOLD_FRACTION, easing: EASING },
      { ...to, offset: 1 },
    ];
  }
  return [
    { ...from, offset: 0, easing: EASING },
    { ...to, offset: 1 - HOLD_FRACTION },
    { ...to, offset: 1 },
  ];
}

function resetFlipStyles(boxEl: HTMLDivElement, wrapperEl: HTMLDivElement) {
  wrapperEl.style.minHeight = "";
  boxEl.style.position = "";
  boxEl.style.zIndex = "";
  boxEl.style.margin = "";
  boxEl.style.top = "";
  boxEl.style.left = "";
  boxEl.style.removeProperty("offset-path");
  boxEl.style.removeProperty("offset-distance");
  boxEl.style.removeProperty("offset-rotate");
  boxEl.style.removeProperty("offset-anchor");
}

// FLIP-animates `boxEl` (via a temporary `position: fixed`) from
// `fromRect` to `toRect`, with border-radius interpolating from
// `fromRadius` to `toRadius`, AND `badgeEl` (the icon glyph) from
// `fromBadge` to `toBadge` -- in the same transition, so they land
// together. Used for BOTH directions: growing from a tray icon into the
// widget, and (reversed) shrinking the widget back into a tray icon --
// same mechanics either way, just different endpoints, so this is the
// one place that logic lives.
//
// The badge used to be positioned with a fixed CSS inset (`right-4
// top-4`, sized for the full-width widget) and just left to ride along
// as the box resized. That works fine at the widget end, but breaks down
// completely at the icon end: a 48px badge inset 16px from the edge of a
// box that's only ~40px wide overflows far past the box's opposite edge,
// so what's visible is a clipped sliver, not a clean small icon landing
// on the tray button -- exactly the "icon doesn't hit its target" bug.
// Explicitly interpolating the badge's own top/right/size/font-size
// between "fills the box, no inset" (icon end) and "48px corner badge"
// (widget end) makes it correctly resemble the plain tray icon at the
// small end and the corner badge at the large end, with everything in
// between reading as one continuous resize rather than two disconnected
// pieces.
//
// Position and box size/shape are animated separately, deliberately:
//
// - Size/shape (width, height, border-radius) are real layout properties,
//   not `transform: scale()`, which distorts whatever border-radius is
//   *currently* set at every frame right along with everything else --
//   since the two rects usually differ hugely in aspect ratio, the
//   radius only ever looks geometrically correct once the scale settles
//   at the very end, reading as a last-instant snap. Animating actual
//   dimensions means the radius interpolates against the box's real
//   current size at every frame.
//
// - Position follows a curved `offset-path` (buildArcPath) instead of
//   interpolating top/left directly. `top`/`left` are fixed at `toRect`'s
//   position for the whole animation; the path supplies an additional
//   offset that's large at the start (pointing back at `fromRect`) and
//   shrinks to zero at the end.
//
// Returns a cancel function that fully resets every style this touched.
function flipWidget(
  boxEl: HTMLDivElement,
  wrapperEl: HTMLDivElement,
  badgeEl: HTMLDivElement,
  fromRect: DOMRect,
  toRect: DOMRect,
  fromRadius: number,
  toRadius: number,
  fromBadge: BadgeGeom,
  toBadge: BadgeGeom,
  // true for the icon-to-widget entrance, false for the widget-to-icon
  // exit -- controls which end of the trip gets the hold.
  growing: boolean,
  onDone: () => void,
  // Whether this trip out of the tray was started by a click on the icon.
  clicked = false
): () => void {
  // Reserve the larger of the two heights on the wrapper so the page
  // doesn't reflow while the box is temporarily taken out of flow below.
  wrapperEl.style.minHeight = `${Math.max(fromRect.height, toRect.height)}px`;

  const path = buildArcPath(
    fromRect.left - toRect.left,
    fromRect.top - toRect.top
  );

  boxEl.style.position = "fixed";
  boxEl.style.zIndex = "10";
  boxEl.style.margin = "0";
  boxEl.style.top = `${toRect.top}px`;
  boxEl.style.left = `${toRect.left}px`;
  boxEl.style.setProperty("offset-path", path);
  boxEl.style.setProperty("offset-rotate", "0deg");
  // offset-path anchors to the box's *center* by default. Since width and
  // height are also animating here, a center anchor means half of an
  // ever-changing dimension is added on top of the path's own offset
  // each frame -- the left/top edges drift independent of the path
  // itself. Anchoring to the top-left corner instead matches how
  // top/left are normally interpreted, and how the path's (dx, dy) was
  // computed above (from .left/.top, not center-to-center).
  boxEl.style.setProperty("offset-anchor", "0% 0%");

  // Only the trip out of the tray starts with a pop; the flight itself
  // waits for it, holding its first frame (the icon) meanwhile.
  const delay = growing ? POP_MS : 0;

  const shapeAnimation = boxEl.animate(
    holdThenSnapKeyframes(
      {
        width: `${fromRect.width}px`,
        height: `${fromRect.height}px`,
        borderRadius: `${fromRadius}px`,
      },
      {
        width: `${toRect.width}px`,
        height: `${toRect.height}px`,
        borderRadius: `${toRadius}px`,
      },
      growing
    ),
    { duration: DURATION, delay, easing: "linear", fill: "both" }
  );

  const positionAnimation = boxEl.animate(
    [{ offsetDistance: "0%" }, { offsetDistance: "100%" }],
    { duration: DURATION, delay, easing: EASING, fill: "both" }
  );

  const badgeAnimation = badgeEl.animate(
    holdThenSnapKeyframes(
      {
        top: `${fromBadge.top}px`,
        right: `${fromBadge.right}px`,
        width: `${fromBadge.size}px`,
        height: `${fromBadge.size}px`,
        fontSize: `${fromBadge.fontSize}px`,
      },
      {
        top: `${toBadge.top}px`,
        right: `${toBadge.right}px`,
        width: `${toBadge.size}px`,
        height: `${toBadge.size}px`,
        fontSize: `${toBadge.fontSize}px`,
      },
      growing
    ),
    { duration: DURATION, delay, easing: "linear", fill: "both" }
  );

  // The pop, created after the animations above so that it overrides the
  // size they are holding for as long as it runs. It is done with real
  // geometry -- a larger box, pulled back by half the difference with
  // negative margins so it grows around its centre -- rather than a
  // scale transform, whose origin browsers resolve differently once an
  // offset-path is involved.
  let popAnimations: Animation[] = [];
  if (growing) {
    const growX = (fromRect.width * (POP_SCALE - 1)) / 2;
    const growY = (fromRect.height * (POP_SCALE - 1)) / 2;
    const rest = {
      width: `${fromRect.width}px`,
      height: `${fromRect.height}px`,
      marginLeft: "0px",
      marginTop: "0px",
      borderRadius: `${fromRadius}px`,
      // Already a full 1px ring, only invisible: see below.
      boxShadow: "0 0 0 1px transparent",
    };
    // The bolder border is the 1px border darkened plus a 1px ring drawn
    // as a shadow, not a wider border: a border that changes width moves
    // everything inside the box, glyph included. The ring fades in at
    // full width rather than growing from nothing, because a line can
    // only be drawn in whole device pixels: a growing one would appear in
    // one step partway through, while its colour can follow the curve
    // smoothly, dip and overshoot included.
    // A mid grey in either colour scheme: the text colour at half strength.
    const ink = `color-mix(in srgb, ${getComputedStyle(boxEl).color} 45%, transparent)`;
    const popped = {
      width: `${fromRect.width * POP_SCALE}px`,
      height: `${fromRect.height * POP_SCALE}px`,
      marginLeft: `${-growX}px`,
      marginTop: `${-growY}px`,
      borderRadius: `${fromRadius * POP_SCALE}px`,
      borderColor: ink,
      boxShadow: `0 0 0 1px ${ink}`,
    };
    const badgeRest = {
      width: `${fromBadge.size}px`,
      height: `${fromBadge.size}px`,
      fontSize: `${fromBadge.fontSize}px`,
    };
    const badgePopped = {
      width: `${fromBadge.size * POP_SCALE}px`,
      height: `${fromBadge.size * POP_SCALE}px`,
      fontSize: `${fromBadge.fontSize * POP_SCALE}px`,
    };
    const total = POP_MS + POP_OUT_MS;
    const frames = <T extends Record<string, string>>(from: T, to: T) => [
      // easeInOutBack: a small dip first, then past the target and back.
      { ...from, offset: 0, easing: "cubic-bezier(0.68, -0.6, 0.32, 1.6)" },
      { ...to, offset: POP_IN_MS / total },
      { ...to, offset: POP_MS / total, easing: "ease-out" },
      { ...from, offset: 1 },
    ];
    // A click is acknowledged at once: the icon starts out tinted, as it
    // was while pressed, and the tint drains away as the pop takes over.
    // The agent opening a widget has no click to acknowledge.
    if (clicked) {
      const tint = `color-mix(in srgb, ${getComputedStyle(boxEl).color} 5%, ${getComputedStyle(boxEl).backgroundColor})`;
      popAnimations.push(
        boxEl.animate(
          [
            { backgroundColor: tint, offset: 0 },
            { backgroundColor: tint, offset: 0.35, easing: "ease-out" },
            { offset: 1 },
          ],
          { duration: POP_MS }
        )
      );
    }
    popAnimations = [
      ...popAnimations,
      boxEl.animate(frames(rest, popped), { duration: total }),
      badgeEl.animate(frames(badgeRest, badgePopped), { duration: total }),
    ];
  }

  // The rects above are a snapshot, but the layout can move mid-flight:
  // the embedding page grows this app's iframe as content arrives, which
  // is typically right as a widget opens, and that shifts everything
  // around the slot. The wrapper stays in normal flow (it is what
  // reserves the slot), so follow it every frame; otherwise the box flies
  // to where the slot used to be and snaps across when it settles.
  const wrapperStart = wrapperEl.getBoundingClientRect();
  let followFrame = requestAnimationFrame(function follow() {
    const wrapperNow = wrapperEl.getBoundingClientRect();
    boxEl.style.top = `${toRect.top + wrapperNow.top - wrapperStart.top}px`;
    boxEl.style.left = `${toRect.left + wrapperNow.left - wrapperStart.left}px`;
    followFrame = requestAnimationFrame(follow);
  });

  let settled = false;
  const settle = (callOnDone: boolean) => {
    if (settled) return;
    settled = true;
    cancelAnimationFrame(followFrame);
    popAnimations.forEach((animation) => animation.cancel());
    shapeAnimation.cancel();
    positionAnimation.cancel();
    badgeAnimation.cancel();
    resetFlipStyles(boxEl, wrapperEl);
    if (callOnDone) onDone();
  };

  Promise.all([
    shapeAnimation.finished,
    positionAnimation.finished,
    badgeAnimation.finished,
  ]).then(
    () => settle(true),
    () => {
      // Rejects when cancelled (AbortError) -- the cancelling caller
      // already settled via the returned function below.
    }
  );

  return () => settle(false);
}

type Displayed = {
  tool: ToolCall["tool"];
  queryKey: string;
  children: ReactNode;
};

export function WidgetMorph({
  tool,
  queryKey,
  children,
  action,
  closing = false,
  onClosed,
}: {
  tool: ToolCall["tool"];
  queryKey: string;
  children: ReactNode;
  // Rendered in the box's top-right corner, inside the content layer so it
  // fades with the content and is never visible while the box is still
  // icon-sized.
  action?: ReactNode;
  // Set to shrink the widget back into its tray icon; onClosed fires once
  // that has finished and the widget can be unmounted.
  closing?: boolean;
  onClosed?: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const [displayed, setDisplayed] = useState<Displayed>({
    tool,
    queryKey,
    children,
  });
  const isFlippingRef = useRef(false);
  const isAutoAnimatingRef = useRef(false);
  const lastHeightRef = useRef<number | null>(null);
  const activeFlipCancelRef = useRef<(() => void) | null>(null);
  const autoHeightCancelRef = useRef<(() => void) | null>(null);
  const contentFadeCancelRef = useRef<(() => void) | null>(null);
  // Written only inside the entrance effect below (never during render --
  // refs shouldn't be mutated there), so the entrance effect can tell a
  // same-tool content update (e.g. "weather in Stockholm" after "weather
  // in Oslo") apart from a genuine new tool to grow in from the tray: if
  // `displayed.tool` matches what this already held last time the effect
  // ran, nothing about *which tool* actually changed, so there's nothing
  // for a FLIP-from-icon animation to do -- the content already
  // re-rendered normally by the time the effect sees it.
  const previousDisplayedToolRef = useRef<ToolCall["tool"] | null>(null);

  if (tool === displayed.tool && queryKey !== displayed.queryKey) {
    setDisplayed({ tool, queryKey, children });
  }

  useLayoutEffect(() => {
    const shown = displayed.tool;
    addDisplayedTool(shown);
    return () => removeDisplayedTool(shown);
  }, [displayed.tool]);

  useLayoutEffect(() => {
    const boxEl = boxRef.current;
    if (!boxEl) return;

    const observer = new ResizeObserver((entries) => {
      const newHeight = entries[0]?.contentRect.height;
      if (newHeight === undefined) return;

      if (isFlippingRef.current || isAutoAnimatingRef.current) {
        lastHeightRef.current = newHeight;
        return;
      }

      const oldHeight = lastHeightRef.current;
      lastHeightRef.current = newHeight;

      if (
        oldHeight === null ||
        Math.abs(oldHeight - newHeight) < 1 ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        return;
      }

      isAutoAnimatingRef.current = true;
      boxEl.style.transition = "none";
      boxEl.style.height = `${oldHeight}px`;
      boxEl.getBoundingClientRect(); // force a reflow before re-enabling transitions

      let rafId1 = 0;
      let rafId2 = 0;
      let timeoutId = 0;
      const finish = () => {
        boxEl.style.height = "";
        boxEl.style.transition = "";
        lastHeightRef.current = newHeight;
        isAutoAnimatingRef.current = false;
        if (autoHeightCancelRef.current === cancelThis) {
          autoHeightCancelRef.current = null;
        }
      };
      const cancelThis = () => {
        cancelAnimationFrame(rafId1);
        cancelAnimationFrame(rafId2);
        clearTimeout(timeoutId);
        finish();
      };
      autoHeightCancelRef.current = cancelThis;

      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          boxEl.style.transition = `height ${DURATION}ms ${EASING}`;
          boxEl.style.height = `${newHeight}px`;
          timeoutId = window.setTimeout(finish, DURATION + 100);
        });
      });
    });

    observer.observe(boxEl);
    return () => {
      observer.disconnect();
      autoHeightCancelRef.current?.();
    };
  }, []);

  // Entrance: grow from a tray icon's rect into this box. Skipped entirely
  // for a same-tool content update (see previousDisplayedToolRef above) --
  // `displayed.children` has already re-rendered normally by this point,
  // so there's nothing left for this effect to do.
  useLayoutEffect(() => {
    // Tool unchanged -- previousDisplayedToolRef already correctly
    // reflects it (see below for exactly when/why it's written), nothing
    // to animate.
    if (previousDisplayedToolRef.current === displayed.tool) return;

    const wrapperEl = wrapperRef.current;
    const boxEl = boxRef.current;
    const contentEl = contentRef.current;
    const badgeEl = badgeRef.current;
    const iconRect =
      takePendingIconRect() ??
      document
        .querySelector(`[data-tool="${displayed.tool}"]`)
        ?.getBoundingClientRect() ??
      null;
    // These early-return paths update the ref immediately: content still
    // updates via the normal React render regardless, no animation is
    // ever going to happen here, so there's no Strict-Mode-cancellation
    // risk to guard against -- unlike the real flipWidget path below,
    // where the write is deliberately deferred to onDone instead.
    if (!wrapperEl || !boxEl || !contentEl || !badgeEl || !iconRect) {
      previousDisplayedToolRef.current = displayed.tool;
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      previousDisplayedToolRef.current = displayed.tool;
      return;
    }

    activeFlipCancelRef.current?.();
    autoHeightCancelRef.current?.();
    contentFadeCancelRef.current?.();

    const targetRect = boxEl.getBoundingClientRect();
    if (targetRect.width === 0 || targetRect.height === 0) {
      previousDisplayedToolRef.current = displayed.tool;
      return;
    }

    contentEl.style.transition = "none";
    contentEl.style.opacity = "0";

    isFlippingRef.current = true;
    let thisCancel: (() => void) | null = null;
    thisCancel = flipWidget(
      boxEl,
      wrapperEl,
      badgeEl,
      iconRect,
      targetRect,
      iconRect.height / 2,
      8,
      iconBadgeGeom(iconRect),
      WIDGET_BADGE_GEOM,
      true,
      () => {
        if (activeFlipCancelRef.current === thisCancel) {
          activeFlipCancelRef.current = null;
        }
        isFlippingRef.current = false;
        // Only written here, on a REAL completion -- never speculatively
        // at the top of the effect. Strict Mode's dev-only double-invoke
        // (mount, run effect, run cleanup, run effect again) cancels the
        // first invocation's flip before it ever reaches this callback
        // (cancel() deliberately skips onDone -- see flipWidget's settle),
        // so this never fires for a cancelled attempt. That means the kept
        // (second) invocation still sees the ORIGINAL previousTool when
        // it re-checks the guard above, correctly treats itself as a real
        // entrance, and this fires for real once IT completes instead.
        previousDisplayedToolRef.current = displayed.tool;
      },
      wasJustClicked(displayed.tool)
    );
    activeFlipCancelRef.current = thisCancel;
    const cancelFlip = thisCancel;

    let rafId1 = 0;
    let rafId2 = 0;
    const cancelContentFade = () => {
      cancelAnimationFrame(rafId1);
      cancelAnimationFrame(rafId2);
      if (contentFadeCancelRef.current === cancelContentFade) {
        contentFadeCancelRef.current = null;
      }
    };
    contentFadeCancelRef.current = cancelContentFade;
    rafId1 = requestAnimationFrame(() => {
      rafId2 = requestAnimationFrame(() => {
        contentEl.style.transition = `opacity ${CONTENT_FADE_DURATION}ms ease-out ${POP_MS + CONTENT_FADE_DELAY}ms`;
        contentEl.style.opacity = "1";
        if (contentFadeCancelRef.current === cancelContentFade) {
          contentFadeCancelRef.current = null;
        }
      });
    });

    return () => {
      // previousDisplayedToolRef is deliberately NOT touched here -- see
      // the onDone callback above for why writing it only on genuine
      // completion (never speculatively, never restored in cleanup) is
      // what makes this survive both Strict Mode's double-invoke AND a
      // real same-tool content update without confusing one for the other.
      isFlippingRef.current = false;
      cancelContentFade();
      if (activeFlipCancelRef.current === cancelFlip) {
        activeFlipCancelRef.current = null;
      }
      cancelFlip();
    };
  }, [displayed]);

  // Exit: detect an incoming tool switch and reverse-shrink the box back
  // into ITS OWN tray icon before accepting the new tool.
  useLayoutEffect(() => {
    if (tool === displayed.tool) return;

    const wrapperEl = wrapperRef.current;
    const boxEl = boxRef.current;
    const contentEl = contentRef.current;
    const badgeEl = badgeRef.current;
    if (!wrapperEl || !boxEl || !contentEl || !badgeEl) {
      queueMicrotask(() => setDisplayed({ tool, queryKey, children }));
      return;
    }

    const oldIconRect = document
      .querySelector(`[data-tool="${displayed.tool}"]`)
      ?.getBoundingClientRect();

    activeFlipCancelRef.current?.();
    autoHeightCancelRef.current?.();
    contentFadeCancelRef.current?.();
    const currentRect = boxEl.getBoundingClientRect();

    if (
      !oldIconRect ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      queueMicrotask(() => setDisplayed({ tool, queryKey, children }));
      return;
    }

    contentEl.style.transition = "opacity 150ms ease-out";
    contentEl.style.opacity = "0";

    isFlippingRef.current = true;
    let thisCancel: (() => void) | null = null;
    thisCancel = flipWidget(
      boxEl,
      wrapperEl,
      badgeEl,
      currentRect,
      oldIconRect,
      8,
      oldIconRect.height / 2,
      WIDGET_BADGE_GEOM,
      iconBadgeGeom(oldIconRect),
      false,
      () => {
        if (activeFlipCancelRef.current === thisCancel) {
          activeFlipCancelRef.current = null;
        }
        flushSync(() => {
          setDisplayed({ tool, queryKey, children });
        });
      }
    );
    activeFlipCancelRef.current = thisCancel;
    const cancelFlip = thisCancel;

    return () => {
      isFlippingRef.current = false;
      if (activeFlipCancelRef.current === cancelFlip) {
        activeFlipCancelRef.current = null;
      }
      cancelFlip();
      contentEl.style.opacity = "";
      contentEl.style.transition = "";
    };
  }, [tool, queryKey, children, displayed.tool]);

  // Close: shrink back into this widget's own tray icon, then tell the
  // parent to unmount it. Kept in a ref so a parent re-render mid-shrink
  // (a new callback identity) can't restart the animation.
  const onClosedRef = useRef(onClosed);
  useLayoutEffect(() => {
    onClosedRef.current = onClosed;
  });
  useLayoutEffect(() => {
    if (!closing) return;

    const wrapperEl = wrapperRef.current;
    const boxEl = boxRef.current;
    const contentEl = contentRef.current;
    const badgeEl = badgeRef.current;
    const iconRect = document
      .querySelector(`[data-tool="${displayed.tool}"]`)
      ?.getBoundingClientRect();
    if (
      !wrapperEl ||
      !boxEl ||
      !contentEl ||
      !badgeEl ||
      !iconRect ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      queueMicrotask(() => onClosedRef.current?.());
      return;
    }

    activeFlipCancelRef.current?.();
    autoHeightCancelRef.current?.();
    contentFadeCancelRef.current?.();
    const currentRect = boxEl.getBoundingClientRect();

    contentEl.style.transition = "opacity 150ms ease-out";
    contentEl.style.opacity = "0";

    isFlippingRef.current = true;
    const cancelFlip = flipWidget(
      boxEl,
      wrapperEl,
      badgeEl,
      currentRect,
      iconRect,
      8,
      iconRect.height / 2,
      WIDGET_BADGE_GEOM,
      iconBadgeGeom(iconRect),
      false,
      // flushSync for the same reason as the exit effect above: settle()
      // has just put the box back in normal flow at full size, so the
      // unmount has to commit before the browser can paint that.
      () => flushSync(() => onClosedRef.current?.())
    );
    activeFlipCancelRef.current = cancelFlip;

    return () => {
      isFlippingRef.current = false;
      if (activeFlipCancelRef.current === cancelFlip) {
        activeFlipCancelRef.current = null;
      }
      cancelFlip();
      contentEl.style.opacity = "";
      contentEl.style.transition = "";
    };
  }, [closing, displayed.tool]);

  const toolDef = TOOLS.find((t) => t.tool === displayed.tool);
  const Icon = toolDef?.icon;

  return (
    <div ref={wrapperRef} data-widget={displayed.tool} className="relative">
      <div
        ref={boxRef}
        className="relative overflow-hidden rounded-lg border border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-950"
      >
        <div ref={contentRef}>
          {displayed.children}
          {action}
        </div>
        <div
          ref={badgeRef}
          aria-hidden
          className="pointer-events-none absolute right-20 top-4 flex h-12 w-12 items-center justify-center text-xl"
        >
          {Icon && (
            <Icon
              aria-hidden
              className={`size-[1em] ${toolDef?.color ?? ""}`}
              strokeWidth={1.75}
            />
          )}
        </div>
      </div>
    </div>
  );
}
