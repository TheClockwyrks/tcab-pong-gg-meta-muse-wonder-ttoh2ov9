// Carom — a top-down paddle duel. See specs/ for the specification.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  ACTIONS,
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  BALL_R,
  BINDINGS,
  CAROM_DEBUG_VERSION,
  CUES,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  MATCHOVER_ITEMS,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  NET_X,
  OBSTACLE_CENTERS,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
  PAUSE_ITEMS,
  SERVE_ANGLE,
  SERVE_SPEED,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  TITLE_ITEMS,
  TITLE_TEXT,
  TRAIL_TIME,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;
}

export interface SnapshotBall {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  spin: number;
  held: boolean;
  holdTimer: number;
  serveSign: 1 | -1;
  trail: { x: number; y: number; t: number }[];
}

export interface CaromSnapshot {
  version: number;
  screen: Screen;
  mode: Mode;
  menuIndex: number;
  titleIndex: number;
  resumeScreen: "countdown" | "playing";
  score: { p1: number; p2: number };
  winner: Side | null;
  muted: boolean;
  paddles: {
    left: { cy: number; vy: number; drivenVy: number; driven: boolean };
    right: { cy: number; vy: number; drivenVy: number; driven: boolean };
  };
  ai: { tracking: boolean; movement: boolean };
  receiver: Side;
  ball: SnapshotBall | null;
  obstacles: { index: number; cx: number; cy: number }[];
  simTime: number;
}

export interface MenuRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ReadState = DeepReadonly<CaromState>;

export interface CaromDebugApi {
  readonly version: number;
  clearWorld(state: ReadState): CaromState;
  spawnBall(state: ReadState): CaromState;
  spawnObstacle(state: ReadState, index: number): CaromState;
  reset(state: ReadState): CaromState;
  reconcile(state: ReadState): CaromState;
  setScreen(state: ReadState, screen: Screen): CaromState;
  setMode(state: ReadState, mode: Mode): CaromState;
  setMenuIndex(state: ReadState, index: number): CaromState;
  setTitleIndex(state: ReadState, index: number): CaromState;
  setResumeScreen(
    state: ReadState,
    screen: "countdown" | "playing",
  ): CaromState;
  setScore(state: ReadState, p1: number, p2: number): CaromState;
  setWinner(state: ReadState, side: Side | null): CaromState;
  setReceiver(state: ReadState, side: Side): CaromState;
  setPaddleCy(state: ReadState, side: Side, cy: number): CaromState;
  setPaddleVy(state: ReadState, side: Side, vy: number): CaromState;
  setPaddleDriven(state: ReadState, side: Side, driven: boolean): CaromState;
  setBallPosition(state: ReadState, x: number, y: number): CaromState;
  setBallVelocity(state: ReadState, vx: number, vy: number): CaromState;
  setBallSpin(state: ReadState, spin: number): CaromState;
  setBallHeld(state: ReadState, held: boolean): CaromState;
  setBallHoldTimer(state: ReadState, seconds: number): CaromState;
  setBallServeSign(state: ReadState, sign: 1 | -1): CaromState;
  drawBallServeSign(state: ReadState): CaromState;
  setAiTracking(state: ReadState, enabled: boolean): CaromState;
  setAiMovement(state: ReadState, enabled: boolean): CaromState;
  setMuted(state: ReadState, muted: boolean): CaromState;
  snapshot(state: ReadState): CaromSnapshot;
  menuItemRect(state: ReadState, index: number): MenuRect | null;
}

export const BACKGROUND = "#0a0e1a";

const PADDLE_LEFT_COLOR = "#22d3ee";
const PADDLE_RIGHT_COLOR = "#fb923c";
const OBSTACLE_COLOR = "#a78bfa";
const BALL_COLOR = "#fde68a";
const HOWTO_ITEMS = ["BACK"] as const;

function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

function bothObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((c, index) => ({ index, cx: c.x, cy: c.y }));
}

function freshPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

function titleState(muted: boolean, simTime: number): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: freshPaddle(), right: freshPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: bothObstacles(),
    simTime,
    muted,
  };
}

/** Return to title, preserving titleIndex / simTime / muted per spec. */
function toTitle(state: ReadState): CaromState {
  const base = titleState(state.muted, state.simTime);
  return { ...base, titleIndex: state.titleIndex, menuIndex: state.titleIndex };
}

function startMatch(state: ReadState, mode: Mode): CaromState {
  return {
    ...state,
    screen: "countdown",
    mode,
    menuIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
    },
  };
}

function menuItemsFor(screen: Screen): readonly string[] | null {
  switch (screen) {
    case "title":
      return TITLE_ITEMS;
    case "howto":
      return HOWTO_ITEMS;
    case "paused":
      return PAUSE_ITEMS;
    case "matchover":
      return MATCHOVER_ITEMS;
    default:
      return null;
  }
}

function menuRectFor(screen: Screen, index: number): MenuRect | null {
  const items = menuItemsFor(screen);
  if (!items || index < 0 || index >= items.length) return null;
  const w = 440;
  const h = 56;
  const x = (FIELD_W - w) / 2;
  let top = 330;
  if (screen === "howto") top = 560;
  else if (screen === "paused") top = 310;
  else if (screen === "matchover") top = 400;
  return { x, y: top + index * 72, w, h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function integratePaddle(
  paddle: ReadState["paddles"]["left"],
  desiredVy: number,
  dt: number,
): PaddleState {
  const raw = paddle.cy + desiredVy * dt;
  const next = clamp(raw, PADDLE_MIN_CY, PADDLE_MAX_CY);
  let vy = desiredVy;
  if (next !== raw && dt > 0) vy = (next - paddle.cy) / dt;
  return { ...paddle, cy: next, vy };
}

function movePaddles(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): CaromState["paddles"] {
  const screen = state.screen;
  const moveOne = (
    side: Side,
    paddle: ReadState["paddles"]["left"],
  ): PaddleState => {
    if (paddle.driven) return integratePaddle(paddle, paddle.drivenVy, dt);
    // AI paddle: solo mode, right side.
    if (state.mode === "solo" && side === "right") {
      if (!state.ai.movement) return { ...paddle, vy: 0 };
      let target = AI_HOME_Y;
      let deadzone = AI_HOME_DEADZONE;
      if (
        state.ai.tracking &&
        screen === "playing" &&
        state.ball &&
        state.ball.vx > 0
      ) {
        target = state.ball.y - state.ball.vy * AI_REACT;
        deadzone = AI_DEADZONE;
      }
      const diff = target - paddle.cy;
      let vy = 0;
      if (Math.abs(diff) > deadzone && dt > 0) {
        vy = Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
      }
      return integratePaddle(paddle, vy, dt);
    }
    let up = 0;
    let down = 0;
    if (state.mode === "solo") {
      // Solo: all four movement actions drive the left paddle.
      if (side === "left") {
        up =
          api.input.value("p1-up") > 0 || api.input.value("p2-up") > 0 ? 1 : 0;
        down =
          api.input.value("p1-down") > 0 || api.input.value("p2-down") > 0
            ? 1
            : 0;
      }
    } else if (side === "left") {
      up = api.input.value("p1-up") > 0 ? 1 : 0;
      down = api.input.value("p1-down") > 0 ? 1 : 0;
    } else {
      up = api.input.value("p2-up") > 0 ? 1 : 0;
      down = api.input.value("p2-down") > 0 ? 1 : 0;
    }
    return integratePaddle(paddle, (down - up) * PADDLE_SPEED, dt);
  };
  return {
    left: moveOne("left", state.paddles.left),
    right: moveOne("right", state.paddles.right),
  };
}

function appendTrail(ball: BallState, t: number): readonly TrailSample[] {
  const next = [...ball.trail, { x: ball.x, y: ball.y, t }];
  return next.filter((s) => t - s.t <= TRAIL_TIME);
}

interface CueFlags {
  paddle: boolean;
  wall: boolean;
  obstacle: boolean;
  score: boolean;
}

function advanceCountdown(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): CaromState {
  const paddles = movePaddles(state, api, dt);
  const base: CaromState = { ...state, paddles };
  if (!state.ball) return base;
  const ball = state.ball;
  const holdTimer = ball.holdTimer - dt;
  if (holdTimer <= 0) {
    const dir = state.receiver === "left" ? -1 : 1;
    const served: BallState = {
      ...ball,
      vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
      vy: ball.serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
      held: false,
      holdTimer: 0,
      trail: [],
    };
    return { ...base, ball: served, screen: "playing" };
  }
  const heldBall: BallState = {
    ...ball,
    holdTimer,
    trail: appendTrail({ ...ball, holdTimer }, state.simTime),
  };
  return { ...base, ball: heldBall };
}

type Face = "left" | "right" | "top" | "bottom";

interface RectHit {
  face: Face;
  x: number;
  y: number;
}

function rectHit(
  x: number,
  y: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): RectHit | null {
  if (!(
    x > x0 - BALL_R &&
    x < x1 + BALL_R &&
    y > y0 - BALL_R &&
    y < y1 + BALL_R
  ))
    return null;
  const left = x - (x0 - BALL_R);
  const right = x1 + BALL_R - x;
  const top = y - (y0 - BALL_R);
  const bottom = y1 + BALL_R - y;
  const min = Math.min(left, right, top, bottom);
  if (min === left) return { face: "left", x: x0 - BALL_R, y };
  if (min === right) return { face: "right", x: x1 + BALL_R, y };
  if (min === top) return { face: "top", x, y: y0 - BALL_R };
  return { face: "bottom", x, y: y1 + BALL_R };
}

function advancePlaying(
  state: ReadState,
  api: UpdateApi,
  dt: number,
  cues: CueFlags,
): CaromState {
  const paddles = movePaddles(state, api, dt);
  if (!state.ball) return { ...state, paddles };
  let { x, y, vx, vy, spin } = state.ball;
  const startSpeed = Math.hypot(vx, vy);
  const n = Math.max(1, Math.ceil((startSpeed * dt) / MAX_SUBSTEP));
  const h = dt / n;
  const sortedObstacles = [...state.obstacles].sort(
    (a, b) => a.index - b.index,
  );

  for (let i = 0; i < n; i++) {
    const speed = Math.hypot(vx, vy);
    if (speed > 0) {
      const angle = (spin / speed) * h;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const nvx = vx * cos - vy * sin;
      const nvy = vx * sin + vy * cos;
      vx = nvx;
      vy = nvy;
    }
    spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
    x += vx * h;
    y += vy * h;

    // Walls
    if (y - BALL_R < 0 && vy < 0) {
      y = BALL_R;
      vy = -vy;
      cues.wall = true;
    } else if (y + BALL_R > FIELD_H && vy > 0) {
      y = FIELD_H - BALL_R;
      vy = -vy;
      cues.wall = true;
    }

    // Paddles
    const paddleSpecs: {
      side: Side;
      x0: number;
      x1: number;
      cy: number;
      vy: number;
    }[] = [
      {
        side: "left",
        x0: P1_X0,
        x1: P1_X1,
        cy: paddles.left.cy,
        vy: paddles.left.vy,
      },
      {
        side: "right",
        x0: P2_X0,
        x1: P2_X1,
        cy: paddles.right.cy,
        vy: paddles.right.vy,
      },
    ];
    for (const p of paddleSpecs) {
      const hit = rectHit(
        x,
        y,
        p.x0,
        p.cy - PADDLE_HALF,
        p.x1,
        p.cy + PADDLE_HALF,
      );
      if (!hit) continue;
      x = hit.x;
      y = hit.y;
      if (hit.face === "left" || hit.face === "right") {
        const offset = clamp((y - p.cy) / PADDLE_HALF, -1, 1);
        const theta = offset * MAX_BOUNCE_ANGLE;
        const contactSpeed = Math.hypot(vx, vy);
        const newSpeed = Math.min(contactSpeed * SPEED_MULT, SPEED_CAP);
        const dir = p.side === "left" ? 1 : -1;
        vx = dir * newSpeed * Math.cos(theta);
        vy = newSpeed * Math.sin(theta);
        spin = clamp(spin + p.vy * SPIN_FROM_PADDLE, -SPIN_CLAMP, SPIN_CLAMP);
        x = p.side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
        cues.paddle = true;
      } else {
        // End cap: like a wall.
        if (hit.face === "top" && vy > 0) {
          vy = -vy;
          cues.wall = true;
        } else if (hit.face === "bottom" && vy < 0) {
          vy = -vy;
          cues.wall = true;
        }
      }
    }

    // Obstacles
    for (const ob of sortedObstacles) {
      const rect = OBSTACLES[ob.index];
      if (!rect) continue;
      const hit = rectHit(x, y, rect.x0, rect.y0, rect.x1, rect.y1);
      if (!hit) continue;
      x = hit.x;
      y = hit.y;
      if (hit.face === "left" && vx > 0) {
        vx = -vx;
        cues.obstacle = true;
      } else if (hit.face === "right" && vx < 0) {
        vx = -vx;
        cues.obstacle = true;
      } else if (hit.face === "top" && vy > 0) {
        vy = -vy;
        cues.obstacle = true;
      } else if (hit.face === "bottom" && vy < 0) {
        vy = -vy;
        cues.obstacle = true;
      }
    }
  }

  let ball: BallState = {
    ...state.ball,
    x,
    y,
    vx,
    vy,
    spin,
    trail: [],
  };
  ball = { ...ball, trail: appendTrail(ball, state.simTime) };

  // Scoring
  let scorer: Side | null = null;
  if (x - BALL_R > FIELD_W) scorer = "left";
  else if (x + BALL_R < 0) scorer = "right";

  if (!scorer) return { ...state, paddles, ball };

  cues.score = true;
  const p1 = state.score.p1 + (scorer === "left" ? 1 : 0);
  const p2 = state.score.p2 + (scorer === "right" ? 1 : 0);
  const wins =
    scorer === "left"
      ? p1 >= WIN_SCORE && p1 - p2 >= WIN_LEAD
      : p2 >= WIN_SCORE && p2 - p1 >= WIN_LEAD;
  if (wins) {
    return {
      ...state,
      paddles,
      ball,
      score: { p1, p2 },
      winner: scorer,
      screen: "matchover",
      menuIndex: 0,
    };
  }
  return {
    ...state,
    paddles,
    score: { p1, p2 },
    receiver: scorer === "left" ? "right" : "left",
    ball: parkedBall(),
    screen: "countdown",
  };
}

function playCues(api: UpdateApi, cues: CueFlags): void {
  if (cues.paddle) api.audio.play(CUES.paddleHit);
  if (cues.wall) api.audio.play(CUES.wallBounce);
  if (cues.obstacle) api.audio.play(CUES.obstacleBounce);
  if (cues.score) api.audio.play(CUES.score);
}

/** Apply a menu confirm effect for `screen` at `index`. */
function confirmMenu(
  state: ReadState,
  screen: Screen,
  index: number,
): { next: CaromState; enteredLive: boolean } {
  if (screen === "title") {
    const withTitle: CaromState = { ...state, titleIndex: index };
    if (index === 0)
      return { next: startMatch(withTitle, "solo"), enteredLive: true };
    if (index === 1)
      return { next: startMatch(withTitle, "versus"), enteredLive: true };
    return {
      next: { ...withTitle, screen: "howto", menuIndex: 0 },
      enteredLive: false,
    };
  }
  if (screen === "howto") return { next: toTitle(state), enteredLive: false };
  if (screen === "paused") {
    if (index === 0)
      return {
        next: { ...state, screen: state.resumeScreen },
        enteredLive: true,
      };
    if (index === 1)
      return { next: startMatch(state, state.mode), enteredLive: true };
    return { next: toTitle(state), enteredLive: false };
  }
  if (screen === "matchover") {
    if (index === 0)
      return { next: startMatch(state, state.mode), enteredLive: true };
    return { next: toTitle(state), enteredLive: false };
  }
  return { next: { ...state }, enteredLive: false };
}

function requireBall(state: ReadState): DeepReadonly<BallState> {
  if (!state.ball) throw new Error("Carom: no ball on the field");
  return state.ball;
}

function withBall(state: ReadState, ball: BallState): CaromState {
  return { ...state, ball };
}

function withPaddle(
  state: ReadState,
  side: Side,
  paddle: PaddleState,
): CaromState {
  return {
    ...state,
    paddles:
      side === "left"
        ? { ...state.paddles, left: paddle }
        : { ...state.paddles, right: paddle },
  };
}

const debugApi: CaromDebugApi = {
  version: CAROM_DEBUG_VERSION,
  clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
  spawnBall: (s) => ({ ...s, ball: parkedBall() }),
  spawnObstacle: (s, index) => {
    const c = OBSTACLE_CENTERS[index];
    if (!c) throw new Error(`Carom: no obstacle with index ${index}`);
    const rest = s.obstacles.filter((o) => o.index !== index);
    const next = [...rest, { index, cx: c.x, cy: c.y }].sort(
      (a, b) => a.index - b.index,
    );
    return { ...s, obstacles: next };
  },
  reset: (s) => titleState(s.muted, 0),
  reconcile: (s) => ({ ...s }),
  setScreen: (s, screen) => ({ ...s, screen }),
  setMode: (s, mode) => ({ ...s, mode }),
  setMenuIndex: (s, index) => ({ ...s, menuIndex: index }),
  setTitleIndex: (s, index) => ({ ...s, titleIndex: index }),
  setResumeScreen: (s, screen) => ({ ...s, resumeScreen: screen }),
  setScore: (s, p1, p2) => ({ ...s, score: { p1, p2 } }),
  setWinner: (s, side) => ({ ...s, winner: side }),
  setReceiver: (s, side) => ({ ...s, receiver: side }),
  setPaddleCy: (s, side, cy) =>
    withPaddle(s, side, {
      ...(side === "left" ? s.paddles.left : s.paddles.right),
      cy,
    }),
  setPaddleVy: (s, side, vy) =>
    withPaddle(s, side, {
      ...(side === "left" ? s.paddles.left : s.paddles.right),
      drivenVy: vy,
    }),
  setPaddleDriven: (s, side, driven) =>
    withPaddle(s, side, {
      ...(side === "left" ? s.paddles.left : s.paddles.right),
      driven,
    }),
  setBallPosition: (s, x, y) => withBall(s, { ...requireBall(s), x, y }),
  setBallVelocity: (s, vx, vy) => withBall(s, { ...requireBall(s), vx, vy }),
  setBallSpin: (s, spin) => withBall(s, { ...requireBall(s), spin }),
  setBallHeld: (s, held) => withBall(s, { ...requireBall(s), held }),
  setBallHoldTimer: (s, seconds) =>
    withBall(s, { ...requireBall(s), holdTimer: seconds }),
  setBallServeSign: (s, sign) => {
    if (sign !== 1 && sign !== -1)
      throw new Error(`Carom: serve sign must be 1 or -1, got ${sign}`);
    return withBall(s, { ...requireBall(s), serveSign: sign });
  },
  drawBallServeSign: (s) =>
    withBall(s, { ...requireBall(s), serveSign: drawServeSign() }),
  setAiTracking: (s, enabled) => ({ ...s, ai: { ...s.ai, tracking: enabled } }),
  setAiMovement: (s, enabled) => ({ ...s, ai: { ...s.ai, movement: enabled } }),
  setMuted: (s, muted) => ({ ...s, muted }),
  snapshot: (s) => ({
    version: CAROM_DEBUG_VERSION,
    screen: s.screen,
    mode: s.mode,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    resumeScreen: s.resumeScreen,
    score: { p1: s.score.p1, p2: s.score.p2 },
    winner: s.winner,
    muted: s.muted,
    paddles: {
      left: {
        cy: s.paddles.left.cy,
        vy: s.paddles.left.vy,
        drivenVy: s.paddles.left.drivenVy,
        driven: s.paddles.left.driven,
      },
      right: {
        cy: s.paddles.right.cy,
        vy: s.paddles.right.vy,
        drivenVy: s.paddles.right.drivenVy,
        driven: s.paddles.right.driven,
      },
    },
    ai: { tracking: s.ai.tracking, movement: s.ai.movement },
    receiver: s.receiver,
    ball: s.ball
      ? {
          x: s.ball.x,
          y: s.ball.y,
          vx: s.ball.vx,
          vy: s.ball.vy,
          speed: Math.hypot(s.ball.vx, s.ball.vy),
          spin: s.ball.spin,
          held: s.ball.held,
          holdTimer: s.ball.holdTimer,
          serveSign: s.ball.serveSign,
          trail: s.ball.trail.map((t) => ({ x: t.x, y: t.y, t: t.t })),
        }
      : null,
    obstacles: s.obstacles.map((o) => ({ index: o.index, cx: o.cx, cy: o.cy })),
    simTime: s.simTime,
  }),
  menuItemRect: (s, index) => menuRectFor(s.screen, index),
};

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    api.audio.define(CUES.paddleHit, {
      wave: "square",
      freq: 540,
      freqTo: 820,
      durationMs: 70,
      gain: 0.16,
    });
    api.audio.define(CUES.wallBounce, {
      wave: "triangle",
      freq: 320,
      freqTo: 210,
      durationMs: 60,
      gain: 0.14,
    });
    api.audio.define(CUES.obstacleBounce, {
      wave: "sine",
      freq: 190,
      freqTo: 340,
      durationMs: 90,
      gain: 0.18,
    });
    api.audio.define(CUES.score, {
      wave: "square",
      freq: 660,
      freqTo: 990,
      durationMs: 200,
      gain: 0.16,
    });

    const diag = api.diagnostics;
    diag.register("screen", (s) => s.screen);
    diag.register("mode", (s) => s.mode);
    diag.register("score-p1", (s) => s.score.p1);
    diag.register("score-p2", (s) => s.score.p2);
    diag.register("ball-x", (s) => (s.ball ? s.ball.x : 0));
    diag.register("ball-y", (s) => (s.ball ? s.ball.y : 0));
    diag.register("ball-vx", (s) => (s.ball ? s.ball.vx : 0));
    diag.register("ball-vy", (s) => (s.ball ? s.ball.vy : 0));
    diag.register("ball-speed", (s) =>
      s.ball ? Math.hypot(s.ball.vx, s.ball.vy) : 0,
    );
    diag.register("ball-spin", (s) => (s.ball ? s.ball.spin : 0));
    diag.register("paddle-left-cy", (s) => s.paddles.left.cy);
    diag.register("paddle-left-vy", (s) => s.paddles.left.vy);
    diag.register("paddle-right-cy", (s) => s.paddles.right.cy);
    diag.register("paddle-right-vy", (s) => s.paddles.right.vy);

    return [titleState(false, 0), debugApi];
  },

  update(state: ReadState, api: UpdateApi, dt: number): CaromState {
    const simTime = state.simTime + dt;
    // Mute handling, on every screen.
    let muted: boolean;
    if (api.input.pressed("mute")) {
      muted = !api.audio.muted();
      api.audio.setMuted(muted);
    } else if (state.muted !== api.audio.muted()) {
      // A debug pose set the state's copy; push it to the runtime.
      api.audio.setMuted(state.muted);
      muted = state.muted;
    } else {
      muted = api.audio.muted();
    }

    // Read every press edge once.
    const upEdge = api.input.pressed("p1-up") || api.input.pressed("p2-up");
    const downEdge =
      api.input.pressed("p1-down") || api.input.pressed("p2-down");
    const confirmEdge = api.input.pressed("confirm");
    const backEdge = api.input.pressed("back");
    const pauseEdge = api.input.pressed("pause");

    const beginScreen = state.screen;
    let s: CaromState = { ...state, simTime, muted };
    let enteredLive = false;
    let acted = false; // a keyboard action consumed this frame's input

    if (beginScreen === "countdown" || beginScreen === "playing") {
      if (pauseEdge) {
        return {
          ...s,
          resumeScreen: beginScreen,
          screen: "paused",
          menuIndex: 0,
        };
      }
      // Fall through to live advance below.
      const cues: CueFlags = {
        paddle: false,
        wall: false,
        obstacle: false,
        score: false,
      };
      const advanced =
        beginScreen === "countdown"
          ? advanceCountdown({ ...s }, api, dt)
          : advancePlaying({ ...s }, api, dt, cues);
      playCues(api, cues);
      return advanced;
    }

    if (beginScreen === "paused" && (pauseEdge || backEdge)) {
      s = { ...s, screen: s.resumeScreen };
      enteredLive = true;
    } else if (
      beginScreen === "title" ||
      beginScreen === "howto" ||
      beginScreen === "paused" ||
      beginScreen === "matchover"
    ) {
      const items = menuItemsFor(beginScreen) ?? [];
      const count = items.length;
      // Back handling that is not a menu confirm.
      if (beginScreen === "howto" && backEdge && !confirmEdge) {
        return toTitle({ ...s });
      }
      if (beginScreen === "matchover" && backEdge) {
        return toTitle({ ...s });
      }
      let idx = s.menuIndex;
      let moved = false;
      if (upEdge && count > 0) {
        idx = (idx - 1 + count) % count;
        moved = true;
      } else if (downEdge && count > 0) {
        idx = (idx + 1) % count;
        moved = true;
      }
      s = { ...s, menuIndex: idx };
      if (!moved && confirmEdge && count > 0) {
        const r = confirmMenu(s, beginScreen, idx);
        s = r.next;
        enteredLive = r.enteredLive;
        acted = true;
      }

      // Pointer / touch, applied after keyboard edges.
      if (!acted) {
        const pointerResult = applyPointer(s, beginScreen, api);
        if (pointerResult) {
          s = pointerResult.next;
          enteredLive = pointerResult.enteredLive || enteredLive;
        }
      }
      // Pointer confirm may have started a match; keyboard confirm likewise.
      if (!enteredLive) return s;
    }

    if (enteredLive && (s.screen === "countdown" || s.screen === "playing")) {
      const cues: CueFlags = {
        paddle: false,
        wall: false,
        obstacle: false,
        score: false,
      };
      const liveState: CaromState = s;
      const advanced =
        liveState.screen === "countdown"
          ? advanceCountdown(liveState, api, dt)
          : advancePlaying(liveState, api, dt, cues);
      playCues(api, cues);
      return advanced;
    }
    return s;
  },

  render(state: ReadState, api: RenderApi): void {
    renderGame(api.ctx, state);
  },
};

function applyPointer(
  s: CaromState,
  screen: Screen,
  api: UpdateApi,
): { next: CaromState; enteredLive: boolean; confirmed: boolean } | null {
  const items = menuItemsFor(screen);
  if (!items) return null;
  const rects = items.map((_, i) => menuRectFor(screen, i));
  const inRect = (x: number, y: number): number => {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
        return i;
    }
    return -1;
  };

  let selected = s.menuIndex;
  let confirmIndex = -1;
  const samples = api.input.pointerSamples();
  // Cross-frame confirm bookkeeping uses the selection carried into the frame.
  const selectionBefore = s.menuIndex;
  let downItemThisFrame = -1;

  for (const sample of samples) {
    const hit = inRect(sample.x, sample.y);
    if (sample.type === "move" && hit >= 0) selected = hit;
    if (sample.type === "down") {
      downItemThisFrame = hit;
      if (hit >= 0) selected = hit;
    }
    if (sample.type === "up") {
      if (downItemThisFrame >= 0) {
        if (hit >= 0 && hit === downItemThisFrame) confirmIndex = hit;
      } else if (hit >= 0 && hit === selectionBefore) {
        confirmIndex = hit;
      }
      if (hit >= 0 && confirmIndex === hit) selected = hit;
    }
  }

  // Hover from the snapshot / live contacts when no samples named an item.
  if (samples.length === 0) {
    const p = api.input.pointer();
    const hit = inRect(p.x, p.y);
    if (hit >= 0 && !(p.device === "mouse" && p.down)) selected = hit;
    for (const c of api.input.pointerContacts()) {
      const chit = inRect(c.x, c.y);
      if (chit >= 0) selected = chit;
    }
  } else {
    // Touch contacts travelling onto an item also select it.
    for (const c of api.input.pointerContacts()) {
      if (c.device !== "touch") continue;
      const chit = inRect(c.x, c.y);
      if (chit >= 0) selected = chit;
    }
  }

  if (confirmIndex >= 0) {
    const base: CaromState = { ...s, menuIndex: confirmIndex };
    const r = confirmMenu(base, screen, confirmIndex);
    return { next: r.next, enteredLive: r.enteredLive, confirmed: true };
  }
  if (selected !== s.menuIndex) {
    return {
      next: { ...s, menuIndex: selected },
      enteredLive: false,
      confirmed: false,
    };
  }
  return null;
}

// ---- Rendering -----------------------------------------------------------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawField(
  ctx: CanvasRenderingContext2D,
  state: ReadState,
  dim: boolean,
): void {
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
  // Subtle vignette border.
  ctx.strokeStyle = "rgba(148,163,184,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, FIELD_W - 2, FIELD_H - 2);

  const alpha = dim ? 0.45 : 1;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Net
  ctx.strokeStyle = "rgba(226,232,240,0.5)";
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 16]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 12);
  ctx.lineTo(NET_X, FIELD_H - 12);
  ctx.stroke();
  ctx.setLineDash([]);

  // Obstacles
  for (const ob of state.obstacles) {
    const rect = OBSTACLES[ob.index];
    if (!rect) continue;
    ctx.fillStyle = OBSTACLE_COLOR;
    ctx.shadowColor = OBSTACLE_COLOR;
    ctx.shadowBlur = 14;
    roundRect(ctx, rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0, 8);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Paddles
  ctx.fillStyle = PADDLE_LEFT_COLOR;
  ctx.shadowColor = PADDLE_LEFT_COLOR;
  ctx.shadowBlur = 16;
  roundRect(
    ctx,
    P1_X0,
    state.paddles.left.cy - PADDLE_HALF,
    P1_X1 - P1_X0,
    PADDLE_HALF * 2,
    7,
  );
  ctx.fill();
  ctx.fillStyle = PADDLE_RIGHT_COLOR;
  ctx.shadowColor = PADDLE_RIGHT_COLOR;
  roundRect(
    ctx,
    P2_X0,
    state.paddles.right.cy - PADDLE_HALF,
    P2_X1 - P2_X0,
    PADDLE_HALF * 2,
    7,
  );
  ctx.fill();
  ctx.shadowBlur = 0;

  // Ball + trail
  if (state.ball) {
    const trail = state.ball.trail;
    if (trail.length > 1) {
      ctx.lineCap = "round";
      for (let i = 1; i < trail.length; i++) {
        const a = trail[i - 1]!;
        const b = trail[i]!;
        const frac = i / trail.length;
        ctx.strokeStyle = `rgba(253,230,138,${(frac * 0.55).toFixed(3)})`;
        ctx.lineWidth = 2 + frac * 7;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    ctx.fillStyle = BALL_COLOR;
    ctx.shadowColor = BALL_COLOR;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (state.ball.held) {
      ctx.strokeStyle = "rgba(253,230,138,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(state.ball.x, state.ball.y, BALL_R + 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawScores(ctx: CanvasRenderingContext2D, state: ReadState): void {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 64px system-ui, sans-serif";
  ctx.fillStyle = PADDLE_LEFT_COLOR;
  ctx.fillText(String(state.score.p1), FIELD_CX - 110, 56);
  ctx.fillStyle = PADDLE_RIGHT_COLOR;
  ctx.fillText(String(state.score.p2), FIELD_CX + 110, 56);
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillStyle = "rgba(226,232,240,0.85)";
  ctx.fillText(state.mode === "solo" ? "SOLO" : "VERSUS", FIELD_CX, 108);
}

function drawMenuItems(
  ctx: CanvasRenderingContext2D,
  screen: Screen,
  state: ReadState,
): void {
  const items = menuItemsFor(screen);
  if (!items) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  items.forEach((label, i) => {
    const r = menuRectFor(screen, i);
    if (!r) return;
    const selected = i === state.menuIndex;
    ctx.fillStyle = selected ? "#facc15" : "rgba(30,41,59,0.92)";
    roundRect(ctx, r.x, r.y, r.w, r.h, 10);
    ctx.fill();
    if (selected) {
      ctx.strokeStyle = "#fef08a";
      ctx.lineWidth = 2;
      roundRect(ctx, r.x, r.y, r.w, r.h, 10);
      ctx.stroke();
    }
    ctx.fillStyle = selected ? "#111827" : "#e2e8f0";
    ctx.font = "700 26px system-ui, sans-serif";
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  });
}

function overlay(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = "rgba(2,6,23,0.62)";
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function renderGame(ctx: CanvasRenderingContext2D, state: ReadState): void {
  const screen = state.screen;
  const dim = screen === "title" || screen === "howto";
  drawField(ctx, state, dim);

  if (
    screen === "playing" ||
    screen === "countdown" ||
    screen === "paused" ||
    screen === "matchover"
  ) {
    drawScores(ctx, state);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  if (screen === "title") {
    overlay(ctx);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 110px system-ui, sans-serif";
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 28;
    ctx.fillText(TITLE_TEXT, FIELD_CX, 190);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(226,232,240,0.9)";
    ctx.font = "500 22px system-ui, sans-serif";
    ctx.fillText(
      "Curve the ball with a moving paddle. Bank it past the obstacles.",
      FIELD_CX,
      262,
    );
    drawMenuItems(ctx, screen, state);
    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.font = "500 17px system-ui, sans-serif";
    ctx.fillText(
      "W/S or ↑/↓ to choose · Enter to confirm · M to mute",
      FIELD_CX,
      620,
    );
  } else if (screen === "howto") {
    overlay(ctx);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 54px system-ui, sans-serif";
    ctx.fillText("HOW TO PLAY", FIELD_CX, 120);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "500 24px system-ui, sans-serif";
    const lines = [
      "Player One (left): W / S    ·    Player Two (right): ↑ / ↓",
      "In Solo, W/S or the arrow keys all move the left paddle.",
      "Strike the ball while your paddle is moving to add spin —",
      "a moving paddle curves the ball's flight until it fades.",
      "The violet obstacles block the middle: bank shots around them.",
      "Score past your opponent. First to 11, by 2, wins.",
      "P pauses · M mutes · Esc backs out",
    ];
    lines.forEach((line, i) => ctx.fillText(line, FIELD_CX, 200 + i * 42));
    drawMenuItems(ctx, screen, state);
  } else if (screen === "countdown") {
    ctx.fillStyle = "rgba(248,250,252,0.95)";
    ctx.font = "800 44px system-ui, sans-serif";
    const secs = state.ball ? Math.max(1, Math.ceil(state.ball.holdTimer)) : 1;
    ctx.fillText(`GET READY · ${secs}`, FIELD_CX, 170);
    ctx.font = "500 20px system-ui, sans-serif";
    ctx.fillStyle = "rgba(226,232,240,0.85)";
    ctx.fillText(
      state.receiver === "left" ? "Serve to the left" : "Serve to the right",
      FIELD_CX,
      208,
    );
  } else if (screen === "paused") {
    overlay(ctx);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 56px system-ui, sans-serif";
    ctx.fillText("PAUSED", FIELD_CX, 210);
    drawMenuItems(ctx, screen, state);
  } else if (screen === "matchover") {
    overlay(ctx);
    ctx.fillStyle = "#facc15";
    ctx.font = "900 64px system-ui, sans-serif";
    ctx.fillText(
      state.winner === "left"
        ? state.mode === "solo"
          ? "YOU WIN!"
          : "LEFT WINS!"
        : state.mode === "solo"
          ? "AI WINS"
          : "RIGHT WINS!",
      FIELD_CX,
      190,
    );
    ctx.fillStyle = "#f8fafc";
    ctx.font = "700 44px system-ui, sans-serif";
    ctx.fillText(`${state.score.p1}  —  ${state.score.p2}`, FIELD_CX, 262);
    ctx.font = "500 20px system-ui, sans-serif";
    ctx.fillStyle = "rgba(226,232,240,0.85)";
    ctx.fillText("Final score", FIELD_CX, 306);
    drawMenuItems(ctx, screen, state);
  }
}
