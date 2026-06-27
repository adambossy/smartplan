# SmartPlan — Roadmap

## 1. Editable plan text with live source sync

Allow the plan's text to be edited directly in the rendered plan. Edits live-sync to the
underlying datastore — the `plan-src/<page-id>.md` source files — so the rendered view and the
source stay in lockstep and drift is minimized. Debounce writes while the user is typing, so we
sync on a pause rather than on every keystroke.

Conflict policy: if the agent edits the plan (for example while incorporating comments), the
user's most recent in-browser edits are **not** guaranteed to be preserved — agent writes win.

## 2. Tighten the page header

Remove the breadcrumb trail and the eyebrow label (e.g. "EXECUTIVE SUMMARY") above the page
title, and move the page title to the top of the page. Less chrome, more content.

## 3. Verify Mermaid diagrams at plan-creation time

When the agent creates a plan, render every Mermaid diagram in the agent's browser and check that
it renders correctly. If a diagram is broken, fix its source and re-render until it renders
cleanly. Verify all diagrams render before handing control back to the user.
