# Apple-optimalizált Dashboard — Projekt Összefoglaló

## Projekt Célja
Well-Worn Pallet Kft. rendszert Apple-eszközökre (iPhone, iPad, Mac, CarPlay, Apple Watch) optimalizálni egy komprehenzív Dashboard Architecture megvalósítása által.

**Státusz:** Architecture Design Complete  
**Ütemezés:** 4-5 hét implementáció (OPCIÓ 3: Web + Minimal Native)  
**Lead:** Backend Developer (notification), iOS Developer (SwiftUI)  
**Artifacts:** 
- [Apple Dashboard Architecture Terv](https://claude.ai/code/artifact/78772c82-db9d-4623-a21e-2a042721c233) (vizuális wireframe + detailed spec)
- [docs/APPLE_INTEGRATION_ROADMAP.md](./APPLE_INTEGRATION_ROADMAP.md) (Week-by-week roadmap)
- [docs/iOS_SKELETON_SWIFT.swift](./iOS_SKELETON_SWIFT.swift) (Swift szkeleton kód)
- [docs/BACKEND_API_GUIDE.md](./BACKEND_API_GUIDE.md) (API spec + implementation)

---

## Megválasztott Architektúra: OPCIÓ 3

### Web + Minimal Native
- **Web-app:** Next.js (meglévő, Attekintes modul alapú Apple Dashboard)
- **iOS app:** SwiftUI WebView container + Swift UI UI layerek
- **Notification:** Backend → APNs → iOS app (push)
- **Widget:** WidgetKit (Lock Screen, Home Screen, 15-30 perc refresh)
- **CarPlay:** SwiftUI + MapKit + Ecofleet GPS integrációs
- **Idõ:** 4-5 hét, iteratív fejlesztés

### Miért OPCIÓ 3?
✅ **Előnyök:**
- One codebase (Next.js) — gyors fejlesztés
- iOS app minimal (WebView wrapper + UI layerek)
- Native Apple features (widget, notifikáció, CarPlay) teljes
- 4-5 hét, nem 10-12 hét (OPCIÓ 4)
- Ecofleet GPS integrálható (MapKit)

❌ **Tradeoff-ek:**
- Web-app korlátok (geolocation CORS, camera csak web/HTTPS)
- Widget 15-30 perc update delay (Apple's policy)
- CarPlay MapKit learning curve

---

## Dashboard Terv

### iPhone (Attekintes Modul)
- **Header:** User name, Logout
- **KPI Banner:** 3 KPI (Lejárt számlák, Nyitott számlák, Fuvarok)
- **Widgets (scroll):**
  1. Fuvar — Jelenlegi fuvar, megállók, ETA, megjegyzés
  2. Számlák — Lejárt, Nyitott, Összeg
  3. Készlet — Kritikus szintek (⚠️ icon)
  4. Posta — Postázásra váró fuvarok
  5. Csapattábla (admin/vezető) — Alkalmazottak jelenléte
- **Tab Navigation (44px):** Áttekintés, Fuvar, Készlet, Profil

### iPad (Multi-panel)
- **Left panel (50%):** KPI banner + Fuvar-lista (scrollable)
- **Right panel (50%):** Kiválasztott fuvar detail (megállók + GPS mapa) vagy Számlák

### Mac (Desktop)
- **Left sidebar (250px):** Navigation + User profil
- **Main content:** Data grid (fuvarok, számlák, készlet) + inline edit + export (CSV, PDF)

### CarPlay (Driver-centric)
- **Top (70%):** Ecofleet GPS mapa + jelenlegi útvonal
- **Bottom (30%):** Fuvar detail (cím, telephelyek, ETA, megjegyzés)
- **Gestures:** Swipe left/right (prev/next stop), Swipe up (mark complete)

### Apple Watch (Optional)
- **Mini-view:** Jelenlegi fuvar (name + status)
- **Complication:** Circular KPI (fuvarok, lejárt számlák)

---

## Notification Stratégia

### Push Notification Triggers
| Event | Trigger | Message | Action |
|-------|---------|---------|--------|
| Fuvar kész | Megálló = "completed" | "Coca-Cola fuvar lezárva" | Open fuvar detail |
| Számla lejárt | due_date < today | "XYZ Partner 150k Ft lejárt" | Open szamlak module |
| Készlet kritikus | qty < min_qty | "EUR raklap < 5 db" | Open keszlet module |
| Feladat új | task_assigned | "Sofőr: Felrakás Nyíregyháza" | Open task detail |

### Widget Data Refresh
- Lock screen: 15 perc (dynamic island)
- Home screen: 30 perc (medium/large)
- Manual refresh: User swipe option

---

## Implementation Roadmap (5 hét)

### WEEK 1: Architecture + Design ⚙️
- [ ] Design canvas publikálása (wireframe)
- [ ] APNs certificate request (Apple Developer)
- [ ] iOS GitHub repo init
- [ ] Backend API design (endpoints)

### WEEK 2: PWA/Web Enhancement 🌐
- [ ] Attekintes → Apple Dashboard (KPI banner, widgets)
- [ ] PWA manifest (app-capable, icons, splash screen)
- [ ] Notification backend (Node.js API route)
- [ ] Test harness (mock notifications)

### WEEK 3: iOS App (Wrapper + Widget) 📱
- [ ] WebView container (WKWebView, session handling)
- [ ] WidgetKit (lock screen + home screen)
- [ ] APNs setup + APNService.swift
- [ ] Test push message

### WEEK 4: Integration + Testing 🧪
- [ ] CarPlay integration (MapKit + Ecofleet)
- [ ] Push notification E2E test
- [ ] Apple Watch (optional)
- [ ] TestFlight beta

### WEEK 5 (Optional): Polish 🎯
- [ ] Performance optimization (memory, network, battery)
- [ ] Offline-first caching (UserDefaults, Service Worker)
- [ ] Release candidate
- [ ] Documentation

---

## Files & References

### Documentation
- `docs/APPLE_INTEGRATION_ROADMAP.md` — Week-by-week detailed roadmap
- `docs/iOS_SKELETON_SWIFT.swift` — Swift szkeleton komponensek
- `docs/BACKEND_API_GUIDE.md` — API endpoints + implementation
- `docs/README_APPLE_DASHBOARD.md` — Ez a fájl

### Web-app (Next.js)
- `app/attekintes/layout.tsx` — Main dashboard layout (meglévő, kiterjesztésre vár)
- `lib/attekintes/theme.ts` — Menta-antracit szín-séma
- `lib/mobil-theme.ts` — Mobile theme (új nézetek)
- `components/attekintes/tab-bar.tsx` — Tab navigation component

### iOS App (New Repository)
- Repository: `bzol33-max/wwp-app-ios` (GitHub)
- Target: iOS 15+ (Swift 5.9+)
- Dependencies: Alamofire, WidgetKit, MapKit

---

## Success Criteria

✅ **Week 1:** Design + architecture approved  
✅ **Week 2:** Notification backend live (staging)  
✅ **Week 3:** iOS app TestFlight (internal)  
✅ **Week 4:** Push notification E2E working  
✅ **Week 5:** Release candidate (beta testers)  

### Launch Metrics
- Push notification delivery: 99%+ (APNs)
- Widget visibility: 100% on lock/home screen
- CarPlay navigation: functional (Ecofleet GPS)
- Offline mode: cached data loads (last 1 hour)
- Performance: app launch < 2s, WebView < 3s

---

## Kockázatok & Mitigáció

| Risk | Impact | Mitigation |
|------|--------|-----------|
| APNs certificate complexity | High | Setup Week 1 early; calendar reminder (annual) |
| Widget 15-30 min update delay | Medium | App notification + widget; user manual refresh |
| CarPlay MapKit learning curve | Medium | Third-party wrapper lib research; spike Week 1 |
| Offline sync conflicts | Low | Server-wins strategy; timestamp-based cache |

---

## Szükséges Erőforrások

### Team
- **Backend Developer** (Next.js/Node.js) — Notification backend, API design
- **iOS Developer** (Swift/SwiftUI) — iOS app, widget, CarPlay
- **QA Engineer** — E2E testing, TestFlight management

### Infrastructure
- **Apple Developer Account** — Bundle ID, certificates, provisioning profiles
- **Railway** — Web-app hosting (meglévő, auto-deploy main)
- **GitHub** — iOS app repo (`bzol33-max/wwp-app-ios`)

### Services
- **Apple Push Notification Service (APNs)** — Certificate + credentials
- **Ecofleet API** — GPS integration (meglévő)
- **Számlázz.hu API** — Invoice sync (meglévő)

---

## Next Steps (Week 1)

1. **GitHub Repository** — Create `bzol33-max/wwp-app-ios` (private)
2. **Apple Developer** — Request APNs certificate (key + team ID)
3. **Xcode Project** — Init SwiftUI app + WebView container
4. **Backend** — Implement `/api/notifications/push` route
5. **Design** — Finalize dashboard wireframe (publish artifact)

---

## Communication & Handoff

- **Architecture:** OPCIÓ 3 (Web + Minimal Native) chosen ✅
- **Artifact:** Visual wireframe + detailed spec published
- **Code:** Swift skeleton + API guide ready
- **Next:** Assign iOS developer, request Apple Developer account, begin WEEK 1

---

## Appendix: Architecture Decision Matrix

| Opció | Codebase | Native | Time | Cost | Complexity |
|-------|----------|--------|------|------|------------|
| 1: PWA-only | 1x | Minimal | 3-4w | Low | Low |
| 2: React Native | 2x | Medium | 6-8w | Medium | High |
| **3: Web + Minimal Native** | **1x + minimal** | **High** | **4-5w** | **Medium** | **Medium** |
| 4: Fully Native | 2x | Full | 10-12w | High | Very High |

**Selected:** OPCIÓ 3 — Best balance of time, cost, and native feature support.

---

## Kontakt & Kérdések

- **Architecture Lead:** claudecode@anthropic.com
- **iOS Implementation:** (iOS Developer TBD)
- **Backend Implementation:** (Backend Developer TBD)
- **Project Status:** [Artifact Link](https://claude.ai/code/artifact/78772c82-db9d-4623-a21e-2a042721c233)

---

*Last Updated: 2026-09-13 | Version: 1.0 Architecture Design*
