/**
 * A numeric spring integrator, for the handful of places motion is driven by
 * a gesture (the service board drag) rather than a fixed enter/exit
 * transition. CSS `@utility anim-*` keyframes in globals.css cover everything
 * else — reach for this only when a value needs to start from a live
 * position and carry a release velocity, which a keyframe can't do.
 *
 * Parameterised as damping ratio + response (seconds), not raw
 * mass/stiffness/damping — the same trade Apple made in UIKit's spring API.
 * Damping 1.0 (critically damped, no overshoot) is the house default; this
 * app's motion contract in globals.css is decelerate-only, so nothing here
 * should be called with a damping ratio below 1.
 */

const REST_DISPLACEMENT = 0.01;
const REST_VELOCITY = 0.01;
const MAX_STEP_SECONDS = 1 / 30;

export interface SpringOptions {
  from: number;
  to: number;
  velocity?: number;
  dampingRatio?: number;
  response?: number;
  onUpdate: (value: number, velocity: number) => void;
  onSettle?: () => void;
}

/** Runs until the value settles; returns a canceller for interruption. */
export function animateSpring({
  from,
  to,
  velocity = 0,
  dampingRatio = 1,
  response = 0.3,
  onUpdate,
  onSettle,
}: SpringOptions): () => void {
  let position = from;
  let v = velocity;
  let last = performance.now();
  let raf = requestAnimationFrame(tick);

  const angularFrequency = (2 * Math.PI) / response;
  const stiffness = angularFrequency * angularFrequency;
  const damping = 2 * dampingRatio * angularFrequency;

  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, MAX_STEP_SECONDS);
    last = now;

    const displacement = position - to;
    const acceleration = -stiffness * displacement - damping * v;
    v += acceleration * dt;
    position += v * dt;

    if (Math.abs(position - to) < REST_DISPLACEMENT && Math.abs(v) < REST_VELOCITY) {
      onUpdate(to, 0);
      onSettle?.();
      return;
    }
    onUpdate(position, v);
    raf = requestAnimationFrame(tick);
  }

  return () => cancelAnimationFrame(raf);
}

/**
 * Apple's momentum-projection formula (Designing Fluid Interfaces, WWDC
 * 2018): where a flick of this velocity would coast to a stop, so a release
 * can target that resting point instead of the raw pointer position.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
