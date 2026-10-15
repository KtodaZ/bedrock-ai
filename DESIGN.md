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
  milestone: "#d4b4ff"
  milestone-fill: "#986ccc"
  milestone-gold: "#f0cd88"
  milestone-gold-fill: "#ba8d46"
  milestone-gold-surface: "#2b2419"
  milestone-gold-border: "#6c552c"
  milestone-green: "#a5e4c9"
  milestone-green-fill: "#4eae8d"
  milestone-green-surface: "#112c24"
  milestone-green-border: "#346550"
  comparison-lavender: "#c3a1ff"
  comparison-teal: "#71d5c1"
  comparison-amber: "#f0bc77"
  comparison-blue: "#88bafa"
typography:
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "14px"
  headline:
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  chart-title:
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  chart-axis:
    fontSize: "12px"
  chart-axis-compact:
    fontSize: "10px"
  chart-note:
    fontSize: "11px"
  timeline-date:
    fontSize: "10px"
  timeline-date-phone:
    fontSize: "9px"
  milestone-label:
    fontSize: "13px"
  milestone-name-phone:
    fontSize: "16px"
    fontWeight: 600
  attendance-stat:
    fontSize: "21px"
    fontWeight: 600
  attendance-stat-phone:
    fontSize: "19px"
    fontWeight: 600
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
Milestone gold emphasizes 500-post multiples; green emphasizes 1,000-post multiples, taking precedence over gold. Ordinary hundreds stay lavender. Badges pair pale text with darker matching surfaces and borders; timeline bars use the corresponding stronger fills. AO comparison series use lavender, teal, amber, and blue in order, paired with named legends and expandable weekly numbers.

## Typography
Use the system stack throughout. Data body text is compact; table values use tabular numerals and right alignment, with names left aligned. Data headings step down to 27px on phones; field labels and table headers are 12px. Existing EH headings use a lavender-to-blue-to-pale gradient.
Attendance chart titles use the chart-title step. Axes use 12px labels, reducing to 10px on compact charts; heatmap values, pace ranges, and timeline counts use 11px. Timeline dates use 10px, reducing to 9px on phones. Milestone badges and expected weeks use 13px; phone PAX names use 16px semibold. Attendance summary values use 21px, reducing to 19px on phones. These small chart annotations supplement visible headings, labels, legends, and expandable numbers.

## Layout
The app fills the viewport, with a persistent header and independently scrolling content. The desktop chat sidebar becomes a sliding panel on smaller screens. EH content is centered in a 48rem container; Data expands to 1320px with 32px horizontal padding.
Data padding reduces to 20px at 900px and 16px at 540px. Profile detail columns collapse at 900px. At 540px, heading actions stack, search spans both filter columns, profile stats use two columns, and companion lists use one.
**The Pinned Name Rule.** Keep wide tables horizontally scrollable and the first column sticky. On phones, its width is 104px with 10px horizontal cell padding and a 6px name/arrow gap; long names wrap without reducing the 13px type. Keep the name text flexible inside the profile button; preserve the numeric columns rather than squeezing them into cards.

Milestone results are the deliberate phone exception to the pinned-table rule: at 540px they become a compact divided list, with PAX and milestone first, then posts remaining, expected week, and pace range. Desktop retains the full table. Attendance summaries keep four compact columns on phones; charts and the weekly AO heatmap can scroll horizontally.

## Elevation & Depth
Tonal surfaces and fine borders provide most separation. The shell includes soft purple/blue background glows; Data stays flat, with a one-pixel boundary shadow on the pinned table column. Preserve existing subtle translucent EH cards.

## Shapes
Shell navigation is pill-shaped; EH cards have larger rounded corners. Data controls and tables use the smaller radii above, with fine borders and compact spacing. Calendar cells have 5px corners.

## Components
Data buttons are at least 40px tall; text fields and native selects are at least 42px. Phone filter inputs use 16px text. Hover changes button fill and border; keyboard focus uses a 2px pale-lavender outline offset by 3px. Disabled buttons are dimmed. Reduced-motion preferences disable Data animations and transitions.
Data view buttons expose pressed state. Keep optional AO, region, and attendance flags inside native advanced-filter disclosure; definitions and monthly entries also use native details/summary.
Sortable table headers expose sort state; result counts announce updates politely. Opening a PAX profile moves focus to its heading. The scrollable results region remains keyboard focusable.
The calendar is a labeled group of static date cells, not a date-picker grid. Purple means post, green means Q; visible Post/Q/QS labels, date descriptions, a legend, and the expandable entry list provide details without relying on color or hover alone.

Attendance trends contain attendance graphs, a comparison of up to four AOs, and weekly turnout heatmap; AO directory details stay out of this surface. Native disclosure contains AO selection and weekly chart numbers. Named legends, weekly numbers, heatmap values, and accessible chart descriptions supplement color.
Milestones default to every 100 posts, emphasizing 500s and 1,000s. Keep search and the time window visible; milestone interval, region, sorting, and CSV export live in More options. Place the optional timeline in a closed native disclosure below the people and pagination; selected bars expose pressed state and filter the list. Forecast definitions remain in their own disclosure.

## Do's and Don'ts
- Do preserve the existing dark purple identity across Chat, EH Challenge, and Data.
- Do keep pinned names, native controls, visible focus, and attendance labels usable on phones.
- Don't replace semantic calendar labels with color alone or turn static dates into implied buttons.
