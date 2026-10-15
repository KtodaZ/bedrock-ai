---
name: Bedrock Data AI
description: Established dark purple attendance interface.
colors:
  background: "#07070f"
  foreground: "#f0f0ff"
  primary: "#7c3aed"
  gradient-end: "#2563eb"
  lavender: "#a78bfa"
  field: "#11101e"
  border: "#343043"
  post: "#2b1d40"
  q: "#0c2d27"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
  headline:
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
rounded:
  field: "6px"
  button: "7px"
  table: "8px"
spacing:
  control-gap: "8px"
  field-padding: "8px 10px"
components:
  data-button:
    backgroundColor: "{colors.field}"
    rounded: "{rounded.button}"
    padding: "8px 12px"
  data-input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.field}"
    padding: "{spacing.field-padding}"
---

# Design System: Bedrock Data AI

## Overview
Dark surfaces, lavender accents, compact controls, and readable attendance records define the incumbent interface. Data extends the existing Chat and EH Challenge identity with denser tables and restrained section dividers.
**Key Characteristics:**
- Dark purple surfaces; violet-to-blue accents in the app shell.
- System typography, explicit labels, and concrete F3 terms.

## Colors
Primary violet and blue form active shell-navigation and action gradients; lavender identifies links and controls. Near-black backgrounds and pale text carry the content. Data uses muted purple borders and fields; calendar post and Q fills have distinct semantic roles.

## Typography
Use the system stack throughout. Data body text is compact; table values use tabular numerals and right alignment, with names left aligned. Data headings step down to 27px on phones; field labels and table headers are 12px. Existing EH headings use a lavender-to-blue-to-pale gradient.

## Layout
The app fills the viewport, with a persistent header and independently scrolling content. The desktop chat sidebar becomes a sliding panel on smaller screens. EH content is centered in a 48rem container; Data expands to 1320px with 32px horizontal padding.
Data padding reduces to 20px at 900px and 16px at 540px. Profile detail columns collapse at 900px. At 540px, heading actions stack, search spans both filter columns, profile stats use two columns, and companion lists use one.
**The Pinned Name Rule.** Keep wide tables horizontally scrollable and the first column sticky. On phones, its width is 145px and long names wrap; preserve the numeric columns rather than squeezing them into cards.

## Elevation & Depth
Tonal surfaces and fine borders provide most separation. The shell includes soft purple/blue background glows; Data stays flat, with a one-pixel boundary shadow on the pinned table column. Preserve existing subtle translucent EH cards.

## Shapes
Shell navigation is pill-shaped; EH cards have larger rounded corners. Data controls and tables use the smaller radii above, with fine borders and compact spacing. Calendar cells have 5px corners.

## Components
Data buttons are at least 40px tall; text fields and native selects are at least 42px. Phone filter inputs use 16px text. Hover changes button fill and border; keyboard focus uses a 2px pale-lavender outline offset by 3px. Disabled buttons are dimmed. Reduced-motion preferences disable Data animations and transitions.
Data view buttons expose pressed state. Keep optional AO, region, and attendance flags inside native advanced-filter disclosure; definitions and monthly entries also use native details/summary.
Sortable table headers expose sort state; result counts announce updates politely. Opening a PAX profile moves focus to its heading. The scrollable results region remains keyboard focusable.
The calendar is a labeled group of static date cells, not a date-picker grid. Purple means post, green means Q; visible Post/Q/QS labels, date descriptions, a legend, and the expandable entry list provide details without relying on color or hover alone.

## Do's and Don'ts
- Do preserve the existing dark purple identity across Chat, EH Challenge, and Data.
- Do keep pinned names, native controls, visible focus, and attendance labels usable on phones.
- Don't replace semantic calendar labels with color alone or turn static dates into implied buttons.
