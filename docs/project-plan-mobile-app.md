# Relio Mobile App --- Project Plan

## Overview

Native mobile companion app for the Relio CRM platform. The app gives field sales reps access to contacts, deals, and activity logging while offline, syncing back to the web app when connectivity returns.

**Target launch:** June 2026
**Team:** 2 iOS, 2 Android, 1 Backend, 1 Design
**Status:** In development (Phase 2 of 4)

---

## Goals

1. Let reps log meetings and update deal stages from the field without a laptop
2. Provide offline-first access to contact and deal data
3. Reduce "forgot to log it" drop-off by 60%
4. Reach feature parity with the core web workflows by V2

## Non-Goals

- Full admin/settings functionality (stays web-only)
- Marketing automation features
- Custom report builder

---

## Architecture

The mobile app uses a local-first sync model. The core data flow looks like this:

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│  Mobile App  │◄────►│  Sync Engine  │◄────►│  Relio API  │
│  (SQLite)    │      │  (CRDT-based) │      │  (Postgres)  │
└─────────────┘      └──────────────┘      └─────────────┘
```

### Key Technical Decisions

- **Local storage:** SQLite with a CRDT merge layer for conflict resolution
- **Sync protocol:** Delta sync over WebSocket, with HTTP fallback
- **Auth:** OAuth 2.0 PKCE flow, biometric unlock for returning sessions
- **Push notifications:** FCM (Android) and APNs (iOS) via unified backend service

---

## Milestones

### Phase 1: Foundation *(Complete)*

- [x] Project setup --- native iOS (Swift) and Android (Kotlin) repos
- [x] Auth flow --- OAuth PKCE + biometric session resume
- [x] Design system --- shared component library across platforms
- [x] CI/CD --- automated builds on merge, TestFlight/Internal Testing track
- [x] Core navigation shell and tab structure

### Phase 2: Core Features *(In Progress)*

- [x] Contact list with search and filters
- [x] Contact detail view with activity timeline
- [x] Deal pipeline board (kanban view)
- [ ] Deal detail view and stage editing
- [ ] Activity logging --- calls, meetings, notes
- [ ] Offline data layer with SQLite persistence

### Phase 3: Sync & Notifications

- [ ] Delta sync engine with CRDT conflict resolution
- [ ] Background sync on connectivity change
- [ ] Push notifications for deal assignments and reminders
- [ ] Sync status indicator and manual sync trigger
- [ ] Conflict resolution UI for divergent edits

### Phase 4: Polish & Launch

- [ ] Performance profiling and optimization pass
- [ ] Accessibility audit (VoiceOver, TalkBack)
- [ ] Beta program --- 50 internal reps for 2 weeks
- [ ] App Store and Play Store submission
- [ ] Launch comms and onboarding flow

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Sync conflicts cause data loss | Medium | High | CRDT model with full audit log; manual conflict UI as fallback |
| Offline storage exceeds device limits | Low | Medium | Cap local dataset to active deals + recent contacts; paginate older data |
| App Store review delays | Medium | Medium | Submit 2 weeks early; pre-clear entitlements with Apple |
| Field reps resist adoption | Medium | High | Embed in existing onboarding; auto-prompt after web meeting logs |

---

## API Requirements

The mobile app needs three new backend endpoints beyond the existing web API:

### `POST /api/mobile/sync`

Accepts a batch of local changes and returns server-side deltas since the client's last sync timestamp.

```json
{
  "client_id": "device-abc-123",
  "last_sync": "2026-03-15T09:30:00Z",
  "changes": [
    {
      "entity": "deal",
      "id": "deal_8f3a",
      "action": "update",
      "fields": { "stage": "negotiation" },
      "timestamp": "2026-03-15T10:14:22Z"
    }
  ]
}
```

### `GET /api/mobile/bootstrap`

Returns the initial dataset for a newly authenticated device --- active deals, recent contacts, and user preferences. Paginated for large accounts.

### `POST /api/mobile/push-register`

Registers a device token for push notifications with platform and preference metadata.

---

## Open Questions

1. **How large is the average rep's working dataset?** Need to benchmark SQLite size for accounts with 5K+ contacts. Sarah is pulling usage data this week.
2. **Should we support tablet layouts at launch?** Design has mocks but engineering estimates add 2 weeks. Leaning toward V1.1.
3. **Biometric auth on shared devices?** Some field teams share iPads. Need to decide if we support fast-switch between users or require full re-auth.

---

## Team Contacts

| Role | Person | Focus |
|---|---|---|
| PM | Dana Reeves | Scope, priorities, launch |
| iOS Lead | Marcus Chen | Swift, UIKit/SwiftUI |
| Android Lead | Priya Kapoor | Kotlin, Jetpack Compose |
| Backend | James Okonkwo | Sync engine, API |
| Design | Lena Vasquez | Mobile UX, design system |
| QA | TBD | Hiring in progress |

---

*Last updated: March 29, 2026*
