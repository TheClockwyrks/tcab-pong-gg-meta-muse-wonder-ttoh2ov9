import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import { describe, expect, it } from "vitest";
import { FIELD_CX, FIELD_CY, FIELD_W, HOLD_TIME } from "./constants";
import { BACKGROUND, game } from "./game";

async function makeEngine(stepMs = 1000 / 60) {
  const canvas = createCanvas(1280, 720);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: 1280,
    height: 720,
    game,
    background: BACKGROUND,
    layout: "dual-vertical",
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => 1280,
      cssHeight: () => 720,
      dpr: () => 1,
      events: () => new EventTarget(),
    },
  });
  await engine.initialize();
  return engine;
}

describe("Carom", () => {
  it("opens on the title screen with a parked ball", async () => {
    const engine = await makeEngine();
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.version).toBe(1);
    expect(snap.screen).toBe("title");
    expect(snap.mode).toBe("solo");
    expect(snap.menuIndex).toBe(0);
    expect(snap.ball?.x).toBe(FIELD_CX);
    expect(snap.ball?.y).toBe(FIELD_CY);
    expect(snap.ball?.held).toBe(true);
    expect(snap.ball?.holdTimer).toBe(HOLD_TIME);
    expect(snap.obstacles).toHaveLength(2);
    expect(engine.diagnostics().length).toBeGreaterThanOrEqual(10);
    engine.destroy();
  });

  it("serves after the hold and moves the ball", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScreen(s, "countdown"));
    engine.apply((s) => engine.debug.setBallHoldTimer(s, 0));
    await engine.advance(2);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.screen).toBe("playing");
    expect(snap.ball?.held).toBe(false);
    await engine.advance(30);
    const after = engine.debug.snapshot(engine.state);
    expect(after.ball?.x).not.toBe(FIELD_CX);
    // First serve goes toward the left.
    expect(after.ball?.vx ?? 0).toBeLessThan(0);
    engine.destroy();
  });

  it("scores when the ball passes the right edge", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setBallPosition(s, FIELD_W - 5, FIELD_CY));
    engine.apply((s) => engine.debug.setBallVelocity(s, 600, 0));
    await engine.advance(10);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.score.p1).toBe(1);
    expect(snap.screen).toBe("countdown");
    expect(snap.receiver).toBe("right");
    engine.destroy();
  });

  it("bounces off a paddle and gains speed", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setPaddleCy(s, "left", FIELD_CY));
    engine.apply((s) => engine.debug.setBallPosition(s, 120, FIELD_CY));
    engine.apply((s) => engine.debug.setBallVelocity(s, -400, 0));
    engine.apply((s) => engine.debug.setBallSpin(s, 0));
    await engine.advance(20);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.ball?.vx ?? 0).toBeGreaterThan(0);
    expect(snap.ball?.speed ?? 0).toBeCloseTo(416, 0);
    engine.destroy();
  });

  it("applies spin as curvature and decays it", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setBallPosition(s, FIELD_CX, FIELD_CY));
    engine.apply((s) => engine.debug.setBallVelocity(s, 500, 0));
    engine.apply((s) => engine.debug.setBallSpin(s, 600));
    const y0 = engine.debug.snapshot(engine.state).ball?.y ?? 0;
    await engine.advance(20);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.ball?.vy ?? 0).toBeGreaterThan(0);
    expect(snap.ball?.y ?? 0).toBeGreaterThan(y0);
    expect(Math.abs(snap.ball?.spin ?? 999)).toBeLessThan(600);
    engine.destroy();
  });

  it("bounces off walls and obstacles without changing speed", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setBallPosition(s, FIELD_CX, 30));
    engine.apply((s) => engine.debug.setBallVelocity(s, 0, -400));
    await engine.advance(6);
    let snap = engine.debug.snapshot(engine.state);
    expect(snap.ball?.vy ?? 0).toBeGreaterThan(0);

    engine.apply((s) => engine.debug.clearWorld(s));
    expect(engine.debug.snapshot(engine.state).ball).toBeNull();
    engine.apply((s) => engine.debug.spawnBall(s));
    engine.apply((s) => engine.debug.spawnObstacle(s, 0));
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setBallPosition(s, 430, 220));
    engine.apply((s) => engine.debug.setBallVelocity(s, 400, 0));
    await engine.advance(20);
    snap = engine.debug.snapshot(engine.state);
    expect(snap.ball?.vx ?? 0).toBeLessThan(0);
    expect(snap.ball?.speed ?? 0).toBeCloseTo(400, 5);
    engine.destroy();
  });

  it("driven paddle moves at drivenVy on the next frame", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setPaddleVy(s, "left", 300));
    engine.apply((s) => engine.debug.setPaddleDriven(s, "left", true));
    const before = engine.debug.snapshot(engine.state);
    await engine.advance(6);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.paddles.left.cy).toBeGreaterThan(before.paddles.left.cy);
    expect(snap.paddles.left.vy).toBeCloseTo(300, 0);
    engine.destroy();
  });

  it("win rule requires 11 points and a lead of 2", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScore(s, 10, 10));
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setBallPosition(s, FIELD_W - 5, FIELD_CY));
    engine.apply((s) => engine.debug.setBallVelocity(s, 600, 0));
    await engine.advance(10);
    let snap = engine.debug.snapshot(engine.state);
    expect(snap.score.p1).toBe(11);
    expect(snap.screen).toBe("countdown");

    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setBallPosition(s, FIELD_W - 5, FIELD_CY));
    engine.apply((s) => engine.debug.setBallVelocity(s, 600, 0));
    await engine.advance(10);
    snap = engine.debug.snapshot(engine.state);
    expect(snap.score.p1).toBe(12);
    expect(snap.screen).toBe("matchover");
    expect(snap.winner).toBe("left");
    engine.destroy();
  });

  it("reset restores the title and menuItemRect reports regions", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScore(s, 5, 3));
    engine.apply((s) => engine.debug.reset(s));
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.screen).toBe("title");
    expect(snap.score).toEqual({ p1: 0, p2: 0 });
    expect(snap.simTime).toBe(0);
    const rect = engine.debug.menuItemRect(engine.state, 0);
    expect(rect).not.toBeNull();
    expect(rect?.w).toBeGreaterThan(0);
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    expect(engine.debug.menuItemRect(engine.state, 0)).toBeNull();
    engine.destroy();
  });

  it("throws when posing an absent ball and reconciles as a no-op", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.clearWorld(s));
    expect(() =>
      engine.apply((s) => engine.debug.setBallVelocity(s, 1, 2)),
    ).toThrow();
    const before = engine.debug.snapshot(engine.state);
    engine.apply((s) => engine.debug.reconcile(s));
    expect(engine.debug.snapshot(engine.state)).toEqual(before);
    engine.destroy();
  });

  it("AI tracks an incoming ball in solo", async () => {
    const engine = await makeEngine();
    engine.apply((s) => engine.debug.setScreen(s, "playing"));
    engine.apply((s) => engine.debug.setPaddleCy(s, "right", 200));
    engine.apply((s) => engine.debug.setBallPosition(s, 800, 500));
    engine.apply((s) => engine.debug.setBallVelocity(s, 400, 0));
    await engine.advance(12);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.paddles.right.cy).toBeGreaterThan(200);
    engine.destroy();
  });

  it("accumulates simTime on menu screens without moving the ball", async () => {
    const engine = await makeEngine();
    await engine.advance(30);
    const snap = engine.debug.snapshot(engine.state);
    expect(snap.simTime).toBeGreaterThan(0.4);
    expect(snap.ball?.x).toBe(FIELD_CX);
    engine.destroy();
  });
});
