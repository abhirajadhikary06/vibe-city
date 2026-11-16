# Vibe City

An open-world, 80s neon-coast game that runs entirely in the browser. Walk the streets, get into any car, talk and dance with the locals, and drive along the beach from golden hour to neon night.

No backend, no server and no downloaded assets. Every building, car, person, texture and sound is generated in code when the game loads.

---

## Quick start

You need [Node.js](https://nodejs.org/) 18 or newer.

```bash
npm install      # install Three.js and Vite
npm run dev      # start the dev server, then open the printed URL
```

| Command | What it does |
|---|---|
| `npm run dev` | Starts a local dev server with hot reload |
| `npm run build` | Builds a static, production-ready site into `dist/` |
| `npm run preview` | Serves the built `dist/` folder locally |

The `dist/` folder is plain static files, so you can host it on any static host (GitHub Pages, Netlify, Vercel, itch.io and so on).

**Tip:** add `?t=HOUR` to the URL to start at a given time of day, e.g. `?t=21.5` for night or `?t=18` for sunset.

---

## Controls

| Key | On foot | In a vehicle |
|---|---|---|
| **W A S D** / arrows | Move (relative to the camera) | Accelerate, brake/reverse, steer |
| **Mouse** | Look around (click the screen to lock the mouse) | Look around (recentres automatically) |
| **Shift** | Sprint | Nitro boost |
| **Space** | Jump | Handbrake (drift) |
| **F** | Enter the nearest vehicle (you'll pull out a traffic car's driver) | Exit (bail out and roll if you're going fast) |
| **E** | Talk to a nearby person | — |
| **Left click** / **J** | Punch | — |
| **1–8** or hold **Tab** | Gestures: Wave, Dance, Point, Thumbs Up, Cheer, Shrug, Flex, Laugh | — |
| **H** | — | Horn (startles nearby people) |
| **R** | — | Reset the car onto the nearest road |
| **C** | Change camera distance | Cycle chase / far / hood camera |
| **T** (hold) | Fast-forward time | Fast-forward time |
| **Q** | Toggle the radio | Toggle the radio |
| **M** | Mute | Mute |
| **Backspace** | Cancel an active Time Trial | Cancel an active Time Trial |
| **Esc** | Pause | Pause |

Gamepads work too: left stick to steer, triggers for throttle and brake, A for handbrake, B or RB for nitro, Y to enter or exit, X to talk, LB for the camera.

---

## Features

### World
- A procedural coastal city on an 8×8 grid of blocks:
  - **Downtown:** glass towers with setback tiers, crown lights and blinking red aviation lights.
  - **Neighbourhoods:** mixed-use blocks with lit shop fronts.
  - **Beachfront:** pastel art-deco buildings with neon trim.
  - **Parks:** green spaces with fountains.
- **Beach:** palm trees, lifeguard towers and umbrellas.
- **Pier:** leads out to a **Ferris wheel** whose lights shift colour.
- **Ocean:** reflects the sky, plus mountains on the horizon.
- **Palm trees** that sway in the wind, and street lights along every road.

### Day and night
- A full day/night cycle (about 16 minutes per in-game day).
- **Sky:** a moving sun with real-time shadows, and drifting procedural clouds that turn pink and orange at sunset.
- **Night:** stars and moonlight.
- **City at night:** lit windows and shops, glowing neon, light shafts under street lights, and wet-looking streets.

### Vehicles
- **Five types:** Convertible, Sports Coupe, Sedan, Taxi and Van, each with its own handling.
- **Arcade physics:** weight transfer, handbrake drifts, nitro, collisions, tyre smoke, skid marks and sparks.
- **Details:** rounded tyres with tread, ten-spoke alloys, brake discs and callipers, door seams, chrome trim, number plates, brake lights and headlights.
- **Any car is driveable:** parked cars, cars knocked out of traffic, or traffic you hijack.

### People
- **Pedestrians:** around 40 of them, with varied skin tones, clothes, hair and accessories, walking the sidewalks and beach.
- **Behaviour:** they talk on the phone, dance, dodge cars, cower at your horn and run away when scared.
- **Interaction:** talk to them (they reply in speech bubbles and sometimes tip you), wave or cheer and they react, or start a dance party they'll join.

### Gameplay
- **Cash pickups:** glowing cash scattered around the city.
- **Drift scoring:** hold a drift to build a multiplier, then cash it in.
- **Time Trial:** drive into the pink marker for an 8-checkpoint race. Your best time is saved.
- **Saved progress:** money and best time are kept in `localStorage`.

### HUD
- **Map:** a rotating minimap with markers for cash and the Time Trial.
- **Speedometer:** a neon gauge with gear and nitro readouts.
- **Messages:** pop-up notifications, an interaction prompt, a gesture wheel and speech bubbles.

### Audio
Everything is synthesised live with the **Web Audio API**: engine sound tied to RPM, tyre screech, wind, impacts, horn, UI sounds and a procedural **synthwave radio**.

---

## Tech stack

| Area | What's used |
|---|---|
| **3D engine** | [Three.js](https://threejs.org/) r170 (WebGL 2) |
| **Build tool** | [Vite](https://vitejs.dev/) 5 |
| **Language** | Plain modern JavaScript (ES modules), HTML and CSS. No UI framework. |
| **Fonts** | Google Fonts: *Bebas Neue* and *Rajdhani* |
| **Audio** | Web Audio API (no audio files) |

### Three.js add-ons used
- `Sky`: physically based sky dome
- `Water`: reflective ocean
- `Lensflare`: sun flare
- `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `GTAOPass` (ambient occlusion), `SMAAPass` (anti-aliasing), `OutputPass`, `ShaderPass`
- `BufferGeometryUtils.mergeGeometries`

### Rendering techniques
- Physically based materials, with clear-coat car paint.
- **Image-based lighting:** the environment map is rebuilt from the sky as the sun moves.
- **Shadows:** soft PCF shadows that follow the player.
- **Post-processing:** bloom, ambient occlusion (Ultra only), and a custom colour grade (chromatic aberration, nitro speed blur, split toning, vignette, film grain), then SMAA.
- **Custom GLSL shaders:** procedural clouds, fake volumetric light cones and GPU particles.
- **Characters:** one skinned mesh per person, procedurally rigged, with smooth two-bone weights at the joints and procedural animation (walk and run cycles, eight gestures, sitting, falling, punching).

### Performance
- **Fewer draw calls:** city geometry is merged by material; palms, street lights and light cones use instancing.
- **Distance detail:** far cars drop wheel and trim detail; far people animate less often and stop casting shadows.
- **Cheaper reflections:** the ocean reflection updates every other frame and skips people, traffic and particles.
- **60 fps cap:** high-refresh displays don't do extra work.
- **Adaptive resolution:** the render resolution scales with frame rate.
- **Lighter HUD:** the minimap and speedometer redraw 30 times a second, and text updates only when it changes.
- **Static world:** fixed objects skip per-frame transform updates.
- **Quality presets** on the title screen:

  | Preset | Max pixel ratio | Shadow map | Ambient occlusion | People / traffic |
  |---|---|---|---|---|
  | Ultra | 2.0 | 4096 | On | 44 / 26 |
  | High (default) | 1.5 | 2048 | Off | 38 / 24 |
  | Medium | 1.0 | 1024 | Off | 26 / 18 |

  People and traffic counts apply on the next page load.

---

## Project structure

```
index.html          Page shell: HUD, title screen, pause overlay
src/
  main.js           Boot, main loop, cameras, quality presets, wiring
  world.js          City generator: roads, buildings, beach, pier, Ferris wheel,
                    palms, street lights, mountains, ocean, colliders
  textures.js       Procedural canvas textures (asphalt, facades, sand, leaves…)
  sky.js            Day/night cycle, sun/moon, clouds, stars, lens flare, environment map
  character.js      Procedural skinned humanoid, outfits, animation and gestures
  player.js         On-foot controller, entering/exiting vehicles, interactions
  peds.js           Pedestrian AI, reactions and dialogue
  car.js            Vehicle models, materials, arcade physics, level of detail
  traffic.js        AI traffic on the road graph, hijack/crash hand-off
  gameplay.js       Cash pickups, drift scoring, Time Trial
  effects.js        Particles (smoke, sparks, nitro flame) and skid marks
  post.js           Post-processing chain and colour-grade shader
  hud.js            Minimap, speedometer, notifications, bubbles, gesture wheel
  audio.js          Synthesised engine, sound effects and synthwave radio
  input.js          Keyboard, mouse (pointer lock), gamepad, gesture wheel
  utils.js          Maths and geometry helpers
  style.css         HUD and menu styling
```

---

## Browser support

Works in any up-to-date desktop browser with WebGL 2: Chrome, Edge, Firefox or Safari. A dedicated GPU is recommended for the Ultra preset. Touch controls aren't implemented yet, so mobile isn't supported.

---

## Notes

- **Original work:** Vibe City is an original project inspired by the 80s neon-coast open-world genre. It doesn't use names, characters, maps, art or music from any existing game.
- **Name:** "Vibe City" is close to an existing game title. If you plan to publish commercially, check the name for trademark conflicts first.
