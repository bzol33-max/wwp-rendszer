# Apple-optimalizált Dashboard Integráció — Roadmap

## Választott Architektúra: OPCIÓ 3 (Web + Minimal Native)

### Alapvető Terv
- **Web-app:** Next.js web-app marad az elsődleges (Attekintes modul alapú Apple Dashboard)
- **iOS app:** SwiftUI WebView container + Swift UI layerek (widget, notifikáció, CarPlay)
- **Ütemezés:** 4-5 hét, iteratív fejlesztés
- **Prioritás:** Push notification → Widget → CarPlay

---

## Week-by-Week Roadmap

### WEEK 1: Architecture + Design
**Lead: Backend/iOS Lead**

#### Mon–Tue: Design Finalization
- [ ] Dashboard wireframe véglegesítés (iPhone/iPad/Mac/CarPlay)
  - iPhone: Attekintes modul kiterjesztés (KPI banner, role-based widgets)
  - iPad: Multi-panel (fuvar + készlet + számlák)
  - Mac: Desktop sidebar + data grid
  - CarPlay: Driver-centric (GPS mapa + fuvar detail)
- [ ] Menta-antracit szín-séma véglegesítés (ld. `lib/attekintes/theme.ts`)
- [ ] Notification mockup & flow diagram
- [ ] → **Artifact:** Design canvas publikálás

#### Wed–Fri: Backend Architecture
- [ ] Apple Developer Account setup (szükséges: team ID, certificates)
- [ ] APNs certificate request & download
- [ ] API endpoint terv
  - `POST /api/notifications/push` — APNs trigger
  - `POST /api/widgets/update` — Widget data refresh
  - `GET /api/dashboard/role/:role` — Role-based dashboard data
- [ ] iOS GitHub repo init (`bzol33-max/wwp-app-ios`)
  - Xcode project template
  - Package dependencies (Alamofire, WidgetKit)
  - Workspace sync (main repo + iOS app)

---

### WEEK 2: PWA/Web Enhancement
**Lead: Web Developer (Next.js)**

#### Mon–Wed: Attekintes → Apple Dashboard
- [ ] Attekintes modul kiterjesztés
  - KPI banner: 3 KPI (Lejárt, Nyitott, Fuvarok)
  - Widget-ready data API (`/api/attekintes/widgets/:role`)
  - Role-based dashboard views (sofőr/vezető/könyvelő/admin)
- [ ] PWA manifest (`public/manifest.json`)
  - `"name": "Well-Worn Pallet"`
  - `"display": "standalone"`
  - `"start_url": "/attekintes"`
  - `"apple-mobile-web-app-capable": true`
  - Icons: 192x192, 512x512, 180x180 (apple-touch-icon)
  - Splash screen (iOS 15+)
- [ ] App Shell ütemezés (`app-shell.tsx`)
  - Pull-to-refresh (`components/mobil/pull-to-refresh.tsx`)
  - Tab navigation (44px min height)
  - Safe area insets (notch, home indicator)

#### Thu–Fri: Notification Backend
- [ ] Notification Service (Next.js API route)
  - Entry: `app/api/notifications/push/route.ts`
  - APNs client integration (`node-apn` vagy `firebase-admin`)
- [ ] Trigger logic
  - Fuvar teljesítve: `fuvarStatusChange` → "Coca-Cola fuvar lezárva"
  - Számla lejárt: `szamlaOverdue` → "XYZ Partner 150k Ft lejárt"
  - Készlet kritikus: `keszletAlert` → "EUR raklap < 5 db"
  - Feladat új: `taskAssigned` → "Sofőr: Felrakás Nyíregyháza"
- [ ] Test harness: mock notifications (Postman/curl)
  - Payload: `{ user_id, type, title, body, data, priority }`
  - Válasz: `{ notification_id, sent_at }`

---

### WEEK 3: iOS App (Wrapper + Swift UI)
**Lead: iOS Developer (Swift)**

#### Mon–Tue: WebView Container
- [ ] SwiftUI project setup
  - `Views/WebViewContainer.swift` — WKWebView wrapper
  - `Services/AuthService.swift` — Session/cookie handling
  - `Views/ContentView.swift` — Tab navigation (4 tabs)
- [ ] Message bridge (native ↔ web)
  - Handler: `"wwpApp"` (custom message from web-app)
  - Use case: geolocation, camera, push permission request
- [ ] URL loading: `https://web-production-91051.up.railway.app/attekintes`
- [ ] Debug: WKWebView inspector (Safari web inspector)

#### Wed: iOS 17+ WidgetKit
- [ ] WidgetKit targets
  - `DashboardLockWidget.swift` — Lock screen (dynamic island, 1-2 line)
  - `DashboardHomeWidget.swift` — Home screen (medium/large)
- [ ] Widget data provider
  - `LockScreenProvider.swift` — Timeline entry (current fuvar, lejárt számlák)
  - `HomeScreenProvider.swift` — KPI box (fuvar count, számlák osszeg, kritikus készlet)
- [ ] Refresh policy
  - Lock screen: 15 perc
  - Home screen: 30 perc
- [ ] Timeline simulation (Xcode preview)

#### Thu–Fri: APNs Setup
- [ ] APNs certificate (Push Notification service)
  - Apple Developer → Certificates
  - Download: `aps_production_*.p8` key
- [ ] APNService.swift
  ```swift
  func requestUserPermission()  // UNUserNotificationCenter.requestAuthorization
  func handleRemoteNotification() // Parse APNs payload
  func handleNotificationResponse() // Deep-link to screen
  ```
- [ ] Backend APNs client config
  - Key ID, Team ID, Bundle ID → APNs JWT token
- [ ] Test push message
  - Curl/Postman test: APNs sandbox environment
  - Device registration: DeviceToken capture

---

### WEEK 4: Integration + Testing
**Lead: QA/Integration Lead**

#### Mon–Tue: CarPlay Integration
- [ ] CarPlayScene.swift (SwiftUI CarPlay template)
  - CPTabBarTemplate (top-level navigation)
  - CPListTemplate (fuvar list with MPMediaItem mockups)
  - CPMapTemplate (Ecofleet GPS integration)
- [ ] Ecofleet GPS Service
  - `Services/EcofleetService.swift` — API client
  - Real-time position: `Vehicles/getLastData` endpoint
  - Map display: MapKit route overlay
- [ ] Fuvar detail infolap (CarPlay)
  - Cím, telephelyek (megállók), ETA, megjegyzés
  - Gesture: swipe left/right (prev/next stop)
  - Gesture: swipe up (mark stop as completed)

#### Wed: Push Notification Testing
- [ ] E2E test scenario
  1. Backend trigger: `POST /api/notifications/push`
  2. APNs delivery: Notification in Notification Center
  3. Deep-link: App opens → dashboard screen
  4. Widget update: Lock screen widget refreshes
- [ ] Test cases
  - Online: normal notification delivery
  - Offline: notification queued (retry logic)
  - Background: notification badge + sound
  - Background: silent notification (data only)
- [ ] Firebase Test Lab (optional, cloud device testing)

#### Thu–Fri: Apple Watch (Optional)
- [ ] WatchKit app target
  - `WatchOS 10+` minimum
  - `InterfaceController.swift` — mini-view (fuvar name + status)
  - `Complication.swift` — circular complication
- [ ] App Groups sync (iPhone ↔ Watch)
  - UserDefaults + App Groups container
  - Background Task (WatchKit background refresh)
- [ ] Test on physical device or simulator

---

### WEEK 5 (Optional): Polish + Optimization
**Lead: Performance/Release Lead**

#### Mon–Tue: Performance Optimization
- [ ] Memory profiling (Xcode Instruments)
  - Heap snapshot: WebView memory usage
  - Network traffic: widget data size
  - Battery: background task impact
- [ ] Network optimization
  - Image lazy-load (iOS lazy loading)
  - Data pagination (list 20/page)
  - Gzip compression (API responses)
- [ ] Battery impact
  - Widget refresh interval tuning (15 vs 30 min)
  - Background task: only when user opens app

#### Wed: Offline-First Caching
- [ ] UserDefaults cache (iOS)
  - Last known fuvar state, számlák count, készlet status
  - Timestamp: cache validity (15 min stale threshold)
- [ ] Service Worker (web-app)
  - Offline fallback: cached pages
  - Sync: retry queue (pending API requests)
- [ ] Conflict resolution strategy
  - Server-wins: online state overwrites offline cache
  - Manual merge (optional): user can choose

#### Thu–Fri: Release Candidate
- [ ] TestFlight distribution
  - Internal builds: team testers
  - External beta: customer testers (5-10 users)
- [ ] A/B testing (optional)
  - Dark mode variant
  - Layout density (compact vs. spacious)
  - Widget style (card vs. numeric)
- [ ] Documentation
  - `README.md`: Setup instructions, device compatibility
  - `DEPLOYMENT.md`: TestFlight → App Store flow
  - API docs: webhook signature verification

---

## Architecture Details

### API Endpoints

#### POST /api/notifications/push
```
Request:
{
  "user_id": "user_123",
  "type": "fuvar_completed|szamla_lejart|keszlet_kritikus|task_new",
  "title": "...",
  "body": "...",
  "data": {
    "fuvar_id": "f456",
    "action_url": "/fuvarozas/f456"
  },
  "priority": "high|normal"
}

Response:
{
  "notification_id": "n789",
  "sent_at": "2026-09-13T14:30:00Z",
  "status": "sent|failed"
}
```

#### POST /api/widgets/update
```
Request:
{
  "widget_id": "lock_screen|home_screen",
  "data": {
    "fuvar_active": {
      "count": 8,
      "current": { "name": "Coca-Cola", "progress": "3/5" }
    },
    "szamlak_lejart": { "count": 3, "osszeg": "450000" },
    "keszlet_kritikus": ["EUR raklap", "Kék tálca"]
  }
}
```

#### GET /api/dashboard/role/:role
```
Response (sofőr):
{
  "fuvar_active": { ... },
  "megallok": [ { ... }, ... ],
  "keszlet": [ { ... }, ... ]
}

Response (vezető):
{
  "kpi": { "napi_fuvarok": 12, "lejart_szamlak": 3 },
  "alkalmazottak": [ { "name": "...", "status": "jelenléti" } ]
}
```

---

## iOS App Project Structure

```
wwp-app-ios/
├── WwpApp.swift               # Entry point (@main)
├── Views/
│   ├── WebViewContainer.swift  # WKWebView wrapper
│   ├── ContentView.swift       # Root tab navigation
│   ├── CarPlayScene.swift      # CarPlay UI
│   └── SettingsView.swift      # App settings
├── Services/
│   ├── APNService.swift        # APNs handling
│   ├── AuthService.swift       # Session/cookie
│   ├── WidgetDataService.swift # Widget data update
│   ├── NotificationService.swift # Local notifications
│   └── EcofleetService.swift   # GPS integration
├── Widgets/
│   ├── DashboardLockWidget.swift
│   └── DashboardHomeWidget.swift
├── Models/
│   ├── NotificationPayload.swift
│   ├── FuvarData.swift
│   ├── SzamlaData.swift
│   └── WidgetEntry.swift
├── Info.plist                 # Bundle ID, URLs
└── wwp-app-ios.xcodeproj

// Widget target structure:
wwp-app-ios/Targets/DashboardWidgets/
├── DashboardWidgets.swift
├── Models/WidgetData.swift
└── Assets/
```

---

## Success Metrics

- **Week 1:** Design + Backend architecture done
- **Week 2:** Attekintes + notification backend → staging
- **Week 3:** iOS app WebView + widget → internal TestFlight
- **Week 4:** Push notification E2E tested
- **Week 5:** TestFlight beta release (external testers)

### Launch Criteria
- [ ] Push notification: 99%+ delivery rate
- [ ] Widget: visible on lock/home screen, auto-refresh works
- [ ] CarPlay: navigation + fuvar detail functional
- [ ] Offline: cached data loads (last 1 hour state)
- [ ] Performance: app launch < 2s, WebView load < 3s

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| APNs certificate expiration | High | Calendar reminder, auto-renewal setup Week 1 |
| Widget data refresh delay (15-30 min) | Medium | App notification + widget; user manual refresh |
| CarPlay MapKit learning curve | Medium | Third-party wrapper library, Week 1 spike |
| Offline sync conflicts | Low | Server-wins strategy, timestamp-based cache |
| iOS version compatibility | Medium | iOS 15+ support, graceful degradation for older versions |

---

## Next Steps (Immediately After Week 1)

1. **GitHub repository:** Create `bzol33-max/wwp-app-ios`
2. **Apple Developer:** Request APNs certificate
3. **Xcode project:** Init SwiftUI app, WebView container
4. **Backend API:** Implement `/api/notifications/push` route
5. **Design:** Finalize dashboard wireframe, publish design canvas
