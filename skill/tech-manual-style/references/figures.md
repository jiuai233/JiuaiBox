# Figure grammar

How to draw figures in the tech-manual style. Read this before drawing any diagram: sequence, flow, state machine, timeline, structure or decision.

The rule behind every figure: **a figure makes one claim, every mark encodes something, and the encoding never changes between figures.** Readers learn the grammar once (the book even opens with a figure that teaches the arrow styles) and then read every later figure without a legend.

## Contents

1. Plate anatomy
2. Colour by meaning
3. Nodes
4. The eight arrow styles
5. Steps, braces and annotation bands
6. Timelines and state
7. Magnifier callouts
8. SVG starter (defs + a sequence figure)
9. Checklist

---

## 1. Plate anatomy

```
┃ FIG. 5.3  INTENT, EFFECT, OUTCOME                         SEQUENCE
┃
┃   [figure body on --panel]
┃
Commit the intent, perform the effect, commit the outcome.  ← bold claim
The phases of spec §5.1's payment example.                    ← muted detail
```

- Wrapper `.tm-fig`: `--panel` background, 1px `--rule` frame, **3px left bar in the chapter accent**.
- Header `.tm-fig-head`: `FIG. n.m` in bold ink mono, title in accent mono caps, figure **type tag** right-aligned in faint mono: `FLOW`, `SEQUENCE`, `STATE`, `DECISION`, `STRUCTURE`, `LAYERS`, `TIMELINE`.
- Caption `.tm-figcaption` sits *outside* the plate. First sentence bold = the claim the figure proves. Then a muted sentence: what's drawn, where the data came from.
- Number figures per section (`FIG. 1.3` = section 1, third figure). An index of figures lists them by claim, not by title.

## 2. Colour by meaning

Pick colour by **what the thing is**, never to make it pretty. Same entity → same colour on every figure.

| token | means (generic) | Pi Durable original |
|---|---|---|
| `blue` | primary data / records / the main object | conversations, entries, transcript |
| `aqua` | persistence, commits, storage, the source of truth | session, commits, storage |
| `violet` | queues, inputs waiting to be processed | submissions, inbox |
| `green` | documents, synced/shared state | documents, Chord state |
| `amber` | work units, jobs, phases, checkpoints | tasks, phases |
| `plum` | AI model, generation, provider | model, generation |
| `forest` | external world: tools, network, side effects | tools, environment |
| `indigo` | observers, views, events, subscribers | watch, events |
| `rose` | **failure only**: crash, abort, error, lost work | crash, abort, fault |
| `grey` | host / outside actors, inactive, out of range | host app, hatched |

When adapting to a new domain, write the mapping table into the document's front matter ("Colour in figures") before the first figure. Keep ≤10 meanings; if you need more, the figure is doing too much.

Rose is reserved. Nothing decorative is rose; a reader seeing rose should immediately think "something went wrong here".

## 3. Nodes

- Rectangles, radius 2px, 1px stroke `--{c}-line`, fill `--{c}-tint`. Text centred: name in `--font-body` 600 ink, sublabel below in muted regular (`submit · configure`).
- The one node the figure is about can use `--aqua-strong` / `--{c}` stroke (1.5px). Only one emphasised node per figure.
- Sequence-diagram party heads: mono, bold, caps, tracked (`HOST`, `HARNESS`, `STORAGE`) with an optional muted sublabel (`your code`, `external system`).
- Code-ish nodes (ids, record numbers): mono 11px, small boxes (`13`, `21`), blue-line stroke.
- Pending / inferred / not logged: **dashed** stroke (4 3), no fill.
- Waiting / outside the active range / still stored but irrelevant: **hatched** fill (45° lines, see SVG defs).
- Group containers: 1px `--{c}` stroke, `--{c}-tint` fill, label in mono caps top-left inside (`SESSION KERNEL · SRC/SESSION`).

## 4. The eight arrow styles

Stroke 1.25px, small filled triangle head in the same colour. The label sits above the arrow in **mono, in the arrow's colour**; an explanation sits below in sans small muted.

| # | kind | stroke | dash | example label |
|---|---|---|---|---|
| 1 | a call | `--ink` | solid | `submit()` |
| 2 | a commit lands | `--aqua` | solid | `commit 2` |
| 3 | state-only commit | `--amber` | dashed `4 3` | `task 9 running` |
| 4 | model request | `--plum` | solid | `streamSimple` |
| 5 | external effect (tool, process, network) | `--forest` | dashed `4 3` | `execute()` |
| 6 | published view / event | `--indigo` | dotted `1.5 3` | `watch frame` |
| 7 | crash / abort / lost work | `--rose` | dashed `4 3` | `abort` |
| 8 | a reply | `--aqua` | dashed `4 3` | `done` |

The arrow the figure is *about* gets stroke 1.75px and a bold label. Everything else stays 1.25px.

Map to new domains by kind, not by name: "a call", "a write lands", "a request to the model", "a side effect", "a notification", "a failure", "a reply".

Connectors in flow figures: 1px, elbowed (orthogonal), `--{c}` of the source, small arrowheads. Leader lines to callouts: 0.75px dashed `--muted`.

## 5. Steps, braces and annotation bands

- **Circled step numbers** in the left margin of the plate, 22px circle, 1px `--ink-2`, number in Source Serif. In captured runs, the number is the real sequence/commit number — not a made-up order.
- **Lifelines**: 1px dotted `--muted` (`1 3`), vertical, time runs down.
- **Braces** on the right edge (`}`) group steps into phases; label in mono caps faint (`PHASE`) with the name in accent mono below (`prepare`).
- **Annotation bands** span lifelines horizontally to say what happens if the process dies here:
  - rose-tint fill + rose-line stroke + Source Serif italic ink text → a failure case ("crash after 1, before 4: rerun charge").
  - grey-tint fill + rule stroke → a safe/neutral case ("nothing runs again").
- **Inline notes** on a figure: Source Serif italic, muted, 12px. Never sans for notes; the serif italic is the "narrator's voice".

## 6. Timelines and state

- Horizontal axis with tick marks every unit, a longer tick every 10, mono numbers below (`1 · 10 · 20 · 27`). Label the axis in accent mono caps (`COMMIT SEQ`).
- Activity bars: solid `--amber-bar` = running; white box with amber-line stroke = pending; hatched = waiting. A thin vertical tick at the end of a bar = it ended; rose tick = it failed.
- Small green/forest dots under a bar = periodic output (one per emission).
- A crash is a **rose zigzag** vertical line across the whole timeline, labelled with a rose chip (`SIGKILL`).
- State machines: rounded-2px state boxes with name in mono + muted sublabel; transitions are 1px ink lines with mono labels, the actor in faint mono caps after (`finish  TASK`). Terminal states get a double border.

## 7. Magnifier callouts

To show the exact data behind one mark, draw a ~180px circle (1px `--ink` stroke, `--paper` fill) connected by a thin dashed leader to the mark. Inside: mono JSON, centred, 10–11px. The fields that matter are coloured (rose for the error, accent for the key field); the rest stays ink. Below the circle: mono caps accent title (`TASK 22 AT THE KILL`) and a serif italic one-liner.

## 8. SVG starter

Copy these defs once per document (or per inline SVG). Colours use CSS custom properties so dark mode follows automatically when the SVG is inline.

```html
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <!-- arrowheads: one per stroke colour -->
    <marker id="ah-ink" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--ink)"/></marker>
    <marker id="ah-aqua" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--aqua)"/></marker>
    <marker id="ah-amber" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--amber)"/></marker>
    <marker id="ah-plum" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--plum)"/></marker>
    <marker id="ah-forest" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--forest)"/></marker>
    <marker id="ah-indigo" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--indigo)"/></marker>
    <marker id="ah-rose" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0.8 L7.5,4 L0,7.2 z" fill="var(--rose)"/></marker>
    <!-- hatch for waiting / out-of-range -->
    <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill="var(--amber-tint)"/>
      <line x1="0" y1="0" x2="0" y2="5" stroke="var(--amber-line)" stroke-width="1.2"/>
    </pattern>
  </defs>
</svg>

<style>
  .fx text { font-family: var(--font-body); fill: var(--ink); }
  .fx .mono { font-family: var(--font-mono); }
  .fx .caps { font-family: var(--font-mono); text-transform: uppercase; letter-spacing: .18em; }
  .fx .voice { font-family: var(--font-voice); font-style: italic; }
  .fx .muted { fill: var(--muted); }
  .fx .life { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 1 3; }
  .fx .a { fill: none; stroke-width: 1.25; }
  .fx .a.main { stroke-width: 1.75; }
  .fx .call   { stroke: var(--ink);    marker-end: url(#ah-ink); }
  .fx .commit { stroke: var(--aqua);   marker-end: url(#ah-aqua); }
  .fx .state  { stroke: var(--amber);  marker-end: url(#ah-amber);  stroke-dasharray: 4 3; }
  .fx .model  { stroke: var(--plum);   marker-end: url(#ah-plum); }
  .fx .effect { stroke: var(--forest); marker-end: url(#ah-forest); stroke-dasharray: 4 3; }
  .fx .event  { stroke: var(--indigo); marker-end: url(#ah-indigo); stroke-dasharray: 1.5 3; }
  .fx .fail   { stroke: var(--rose);   marker-end: url(#ah-rose);   stroke-dasharray: 4 3; }
  .fx .reply  { stroke: var(--aqua);   marker-end: url(#ah-aqua);   stroke-dasharray: 4 3; }
</style>
```

A three-party sequence figure (copy, then change parties/steps):

```html
<figure class="tm-fig" data-accent="amber">
  <div class="tm-fig-head"><span class="tm-fig-id">Fig. 5.3</span><span class="tm-fig-title">Intent, effect, outcome</span><span class="tm-fig-type">Sequence</span></div>
  <svg class="fx" viewBox="0 0 640 300" role="img" aria-labelledby="f53t">
    <title id="f53t">Phase handler commits intent, calls payments, commits outcome</title>
    <!-- party heads -->
    <g font-size="11">
      <rect x="40"  y="8" width="130" height="34" rx="2" fill="var(--amber-tint)" stroke="var(--amber-line)"/>
      <text x="105" y="25" text-anchor="middle" class="caps" font-weight="700">Phase handler</text>
      <text x="105" y="37" text-anchor="middle" class="muted" font-size="10">your code</text>
      <rect x="255" y="8" width="130" height="34" rx="2" fill="var(--aqua-tint)" stroke="var(--aqua-line)"/>
      <text x="320" y="25" text-anchor="middle" class="caps" font-weight="700">Session</text>
      <text x="320" y="37" text-anchor="middle" class="muted" font-size="10">storage</text>
      <rect x="470" y="8" width="130" height="34" rx="2" fill="var(--forest-tint)" stroke="var(--forest-line)"/>
      <text x="535" y="25" text-anchor="middle" class="caps" font-weight="700">Payments</text>
      <text x="535" y="37" text-anchor="middle" class="muted" font-size="10">external system</text>
    </g>
    <!-- lifelines -->
    <line class="life" x1="105" y1="42" x2="105" y2="292"/><line class="life" x1="320" y1="42" x2="320" y2="292"/><line class="life" x1="535" y1="42" x2="535" y2="292"/>
    <!-- step 1: commit (main) -->
    <circle cx="16" cy="72" r="10" fill="var(--paper)" stroke="var(--ink-2)"/><text x="16" y="76" text-anchor="middle" class="voice" font-size="11">1</text>
    <text x="212" y="64" text-anchor="middle" class="mono" font-size="12" font-weight="700" style="fill:var(--aqua)">{ phase: "charge", key }</text>
    <line class="a commit main" x1="106" y1="72" x2="318" y2="72"/>
    <text x="212" y="88" text-anchor="middle" class="muted" font-size="11">commit the intent</text>
    <!-- crash band -->
    <rect x="80" y="100" width="480" height="24" rx="2" fill="var(--rose-tint)" stroke="var(--rose-line)"/>
    <text x="320" y="116" text-anchor="middle" class="voice" font-size="12">crash here: rerun prepare; nothing was sent</text>
    <!-- step 2: effect -->
    <circle cx="16" cy="152" r="10" fill="var(--paper)" stroke="var(--ink-2)"/><text x="16" y="156" text-anchor="middle" class="voice" font-size="11">2</text>
    <text x="320" y="144" text-anchor="middle" class="mono" font-size="12" style="fill:var(--forest)">charge(key)</text>
    <line class="a effect" x1="106" y1="152" x2="533" y2="152"/>
    <text x="320" y="168" text-anchor="middle" class="muted" font-size="11">the effect, outside any commit</text>
    <!-- step 3: reply -->
    <circle cx="16" cy="212" r="10" fill="var(--paper)" stroke="var(--ink-2)"/><text x="16" y="216" text-anchor="middle" class="voice" font-size="11">3</text>
    <text x="212" y="204" text-anchor="middle" class="mono" font-size="12" style="fill:var(--aqua)">terminal + receipt</text>
    <line class="a commit" x1="106" y1="212" x2="318" y2="212"/>
    <text x="212" y="228" text-anchor="middle" class="muted" font-size="11">outcome and entry in one commit</text>
    <rect x="80" y="250" width="480" height="24" rx="2" fill="var(--grey-tint)" stroke="var(--rule)"/>
    <text x="320" y="266" text-anchor="middle" class="voice muted" font-size="12">crash after 3: the record is the receipt; nothing runs again</text>
  </svg>
</figure>
<p class="tm-figcaption"><strong>Commit the intent, perform the effect, commit the outcome.</strong> A crash in the middle reruns only the effect phase.</p>
```

SVG text sizes: 12px mono for arrow labels, 11px for sublabels and explanations, 10–11px mono caps for party heads. Never below 10px.

## 9. Checklist

- [ ] One claim; the caption's bold first sentence states it.
- [ ] Every colour maps to the document's colour table; rose only for failure.
- [ ] Arrow style matches its kind (one of the eight); only the subject arrow is heavy.
- [ ] Dashed = pending/inferred; hatched = waiting/out of range; consistently.
- [ ] Step numbers are real sequence numbers when the figure depicts a captured run.
- [ ] Notes in serif italic, labels in mono, names in sans.
- [ ] Figure has a type tag and an id; SVG has `<title>` / `aria-labelledby`.
- [ ] Wide figures scroll inside the plate on phones (`.tm-fig` has `overflow-x: auto`); the page itself never scrolls horizontally.
