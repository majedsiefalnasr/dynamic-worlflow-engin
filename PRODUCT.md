# Product

## Register

product

## Users

National Committee for Import Financing administrators, bank and exchange institution staff, support reviewers, executive committee members, committee managers, and system operators using an Arabic RTL workflow tool during import-financing review work.

Users need to create, inspect, route, approve, reject, vote on, audit, and report import-financing requests with enough role and organization context to avoid acting on the wrong request.

## Product Purpose

The product manages import-financing request workflows for the National Committee for Import Financing. The current root `src/` app is the TanStack Start frontend and functional UI reference. The production direction is this frontend integrated incrementally with a separate Laravel 11 REST API and MySQL backend.

Success means users can see only the work in their scope, understand the current workflow stage, complete the next valid action, and audit what happened without relying on hard-coded demo paths.

## Brand Personality

Restrained, institutional, precise.

The interface should feel like a trusted financial operations tool: quiet enough for repeated daily use, explicit about authority and status, and careful with Arabic labels, role names, and workflow terminology.

## Anti-references

Do not make the app feel like a generic SaaS marketing dashboard, a decorative analytics mockup, or a persona-switching demo. Avoid ornamental gradients, noisy card grids, glass effects, oversized marketing typography, and copy that hides operational meaning behind broad product language.

Do not reintroduce demo business data, extra users, banks, committee identities, or persona switching when a task is only about UI quality or metadata scaffolding.

## Design Principles

1. Authority before decoration: every page should make the acting role, scope, status, and next valid action clear.
2. Workflow clarity over visual novelty: stage names, transition labels, read-only states, and empty states must describe the actual engine behavior.
3. Dense but calm operations: tables, forms, and admin panels should support scanning and repeated action without marketing-style theatrics.
4. Arabic RTL first: labels, spacing, icon direction, numerals, and truncation should be checked in the actual Arabic interface.
5. Preserve phase boundaries: UI improvements must not create real requests, entities, users, or workflow instances unless the implementation scope explicitly allows it.

## Accessibility & Inclusion

Target WCAG 2.2 AA for the web app. Keyboard navigation, visible focus, form labels, readable contrast, reduced-motion behavior, and 44px touch targets matter because the product is an operational government and banking tool. Arabic RTL reading order and screen-reader labels must be treated as first-class requirements.
