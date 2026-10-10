# Print / PDF (Paged.js)

The original manual is HTML typeset with Paged.js and exported to PDF from Chrome. Use this when the user wants a printable book, a PDF manual, or "make it look like a real printed document".

## Setup

```html
<script src="https://unpkg.com/pagedjs@0.4.3/dist/paged.polyfill.min.js"></script>
```

Plain `window.print()` / Chrome "Save as PDF" also works for simple documents; Paged.js adds running heads, page counters and cross-reference page numbers.

## Page rules

```css
@page {
  size: letter;               /* or A4 */
  margin: 0.75in 0.8in 0.8in;
  background: var(--paper);
  @top-left    { content: string(section); font: 8pt var(--font-body); color: #727A85; }
  @top-right   { content: "Ledger";        font: 8pt var(--font-body); color: #727A85; }
  @bottom-left { content: "LEDGER / TECHNICAL MANUAL"; font: 6.5pt var(--font-mono); letter-spacing: .18em; color: #989CA1; }
  @bottom-right{ content: counter(page);   font: 8pt var(--font-mono); color: #1C2633; }
}
@page :first { @top-left { content: none } @top-right { content: none } @bottom-left { content: none } @bottom-right { content: none } }
@page part   { background: #102032; margin: 0.9in;
               @top-left { content: none } @top-right { content: none }
               @bottom-left { content: "LEDGER TECHNICAL MANUAL"; color: #7E868F; }
               @bottom-right { content: "PART " counter(part); font: 6.5pt var(--font-mono); letter-spacing: .18em; color: #7E868F; } }
@page front  { @bottom-right { content: counter(page, lower-roman); } }

.tm-part { page: part; counter-increment: part; }
.tm-section-head h1 { string-set: section content(text); }

/* cross-reference with page number: <a class="tm-xref" href="#commit">the commit</a> */
.tm-xref::after { content: " (p. " target-counter(attr(href), page) ")"; color: #989CA1; font-size: .86em; }
```

## Print sizes (pt) observed in the original, US Letter

| element | size / leading |
|---|---|
| body | 10pt / 15pt, Source Sans 3 |
| section title (h1) | ~25pt Manrope 600, tracking -0.02em |
| dek | 12pt / 15pt Source Serif 4 italic, muted |
| h2 | ~14pt Manrope 600 |
| captions, tables | 8pt |
| mono labels | 6.5–7pt caps, tracking 0.18em |
| margins | ~57pt left/right, ~44pt to running head |
| part title | ~36pt Manrope; ghost numeral ~200pt |

Keep figures, callouts and tables `break-inside: avoid`; captions `break-before: avoid`; each section starts on a new page.
