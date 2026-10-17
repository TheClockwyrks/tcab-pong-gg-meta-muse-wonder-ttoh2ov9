# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two
paddles face each other across a dark field while a ball ricochets between
them, off the top and bottom walls, and off a pair of violet obstacles in the
middle. Score by sending the ball past the far edge behind your opponent.

Its signature mechanic is **spin**: strike the ball while your paddle is
moving and the ball's flight curves afterward, fading over time. The two
fixed obstacles turn the open field into a bank-shot puzzle — defend the
direct lane, then bend a shot around a barrier to score.

Play Solo against an AI opponent that tracks the ball, or Versus with two
players sharing one keyboard. First to 11 wins, and you must lead by 2.

The game draws everything in code on a canvas — no art or audio files, no
backend, nothing fetched at runtime.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints. Use `npm run preview` to serve a production
build locally.

## Production build

```sh
npm ci
npm run build
```

This type-checks the project and emits the complete static site into
`dist/`, with `index.html` at its root. Serve that directory as-is from any
static file server.

Other commands: `npm test` runs the unit tests with coverage,
`npm run typecheck`, `npm run lint`, and `npm run format` run the type,
lint, and format checks.

## Controls

| Action | Keys |
| --- | --- |
| Player One (left paddle) | `W` up, `S` down |
| Player Two (right paddle) | `↑` up, `↓` down |
| Confirm menu item | `Enter` or `Space` |
| Back | `Esc` |
| Pause | `P` or `Esc` |
| Mute | `M` |

In Solo, both `W`/`S` and the arrow keys move your left paddle while the AI
defends the right. Menus also work with the mouse and touch: hover or touch
to select an item, press and release inside it to confirm. Touch players get
on-screen sliders automatically.

**Spin tip:** the faster your paddle is moving at the instant of contact,
the harder the ball curves — downward motion bends it down, upward motion
bends it up. Spin decays as the ball flies and survives wall and obstacle
bounces, so start the curve early on a long bank shot.
