# Backend API Guide — Apple Dashboard Integration

## Overview
This guide defines the API endpoints required for iOS app, widget, and notification integration.

---

## 1. Push Notification API

### POST /api/notifications/push
Sends a push notification via Apple Push Notification Service (APNs).

**Request Body:**
```json
{
  "user_id": "user_123",
  "type": "fuvar_completed|szamla_lejart|keszlet_kritikus|task_new",
  "title": "Coca-Cola fuvar lezárva",
  "body": "1 megálló maradt",
  "priority": "high|normal",
  "data": {
    "fuvar_id": "f456",
    "action_url": "/fuvarozas/f456",
    "badge": 1
  },
  "expires_in_seconds": 3600
}
```

**Response (Success):**
```json
{
  "notification_id": "notif_789xyz",
  "sent_at": "2026-09-13T14:30:00Z",
  "status": "sent"
}
```

**Response (Error):**
```json
{
  "error": "invalid_device_token",
  "message": "User has no registered push token"
}
```

**Implementation (Next.js):**
```typescript
// app/api/notifications/push/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as apn from 'apn';

const apnProvider = new apn.Provider({
  key: process.env.APN_KEY_PATH,
  keyId: process.env.APN_KEY_ID,
  teamId: process.env.APN_TEAM_ID,
  bundleId: 'com.wwp.app',
});

export async function POST(req: NextRequest) {
  const {
    user_id,
    type,
    title,
    body,
    priority,
    data,
    expires_in_seconds,
  } = await req.json();

  try {
    // Get device token from database
    const user = await getUserById(user_id);
    if (!user?.apns_device_token) {
      return NextResponse.json(
        { error: 'invalid_device_token' },
        { status: 404 }
      );
    }

    // Build APN notification
    const notification = new apn.Notification({
      deviceToken: user.apns_device_token,
      alert: {
        title,
        body,
      },
      badge: data?.badge || 1,
      sound: 'default',
      contentAvailable: priority === 'high',
      mutableContent: true,
      payload: {
        fuvar_id: data?.fuvar_id,
        action_url: data?.action_url,
        type,
      },
      expiration: Math.floor(Date.now() / 1000) + expires_in_seconds,
    });

    // Send notification
    const result = await apnProvider.send(notification, [user.apns_device_token]);

    return NextResponse.json({
      notification_id: `notif_${result.sent[0]}`,
      sent_at: new Date().toISOString(),
      status: 'sent',
    });
  } catch (error) {
    console.error('Push notification error:', error);
    return NextResponse.json(
      { error: 'notification_failed', message: error.message },
      { status: 500 }
    );
  }
}
```

---

## 2. Device Token Registration

### POST /api/notifications/register-device
Called by iOS app on first launch to register device token.

**Request Body:**
```json
{
  "user_id": "user_123",
  "device_token": "abc123def456...",
  "device_type": "iOS",
  "os_version": "17.0",
  "app_version": "1.0.0"
}
```

**Response:**
```json
{
  "registered": true,
  "device_id": "device_xyz789"
}
```

**Implementation:**
```typescript
// app/api/notifications/register-device/route.ts
export async function POST(req: NextRequest) {
  const { user_id, device_token, device_type, os_version, app_version } = await req.json();

  try {
    // Update or create device record
    await db.devices.upsert({
      where: { user_id_device_token: { user_id, device_token } },
      create: {
        user_id,
        device_token,
        device_type,
        os_version,
        app_version,
        registered_at: new Date(),
      },
      update: {
        os_version,
        app_version,
        last_seen: new Date(),
      },
    });

    return NextResponse.json({
      registered: true,
      device_id: `device_${user_id}_${Date.now()}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'registration_failed' },
      { status: 500 }
    );
  }
}
```

---

## 3. Widget Data API

### GET /api/widgets/data/:role
Provides data for iOS Lock Screen and Home Screen widgets.

**Parameters:**
- `role`: `soffor|szallitovezeto|konyvelő|admin`

**Response (sofőr):**
```json
{
  "fuvar_active": {
    "count": 8,
    "current": {
      "id": "f456",
      "name": "Coca-Cola — Budakeszi",
      "progress": "3/5",
      "eta": "15:30"
    }
  },
  "szamlak": {
    "lejart": { "count": 3, "osszeg": 450000 },
    "nyitott": { "count": 12, "osszeg": 2300000 }
  },
  "keszlet_kritikus": [
    { "item": "EUR raklap", "qty": 3, "min": 5 },
    { "item": "Kék tálca", "qty": 2, "min": 10 }
  ],
  "timestamp": "2026-09-13T14:30:00Z"
}
```

**Response (szállítóvezetõ/admin):**
```json
{
  "kpi": {
    "napi_fuvarok": 12,
    "lejart_szamlak": 3,
    "kritikus_keszlet": 2
  },
  "fuvar_list": [
    { "id": "f456", "name": "Coca-Cola", "progress": "3/5", "status": "aktiv" },
    { "id": "f457", "name": "Pepsi", "progress": "2/4", "status": "aktiv" }
  ],
  "alkalmazottak": [
    { "id": "user_123", "name": "Kiss Ferenc", "status": "jelenléti" }
  ],
  "timestamp": "2026-09-13T14:30:00Z"
}
```

**Implementation:**
```typescript
// app/api/widgets/data/[role]/route.ts
export async function GET(
  req: NextRequest,
  { params: { role } }: { params: { role: string } }
) {
  try {
    const session = await requireSession();
    
    if (role === 'soffor') {
      const fuvarok = await getFuvarDashboardData(session.user_id);
      const szamlak = await getSzamlaSummary(session.user_id);
      const keszlet = await getKeszletKritikus();

      return NextResponse.json({
        fuvar_active: fuvarok,
        szamlak,
        keszlet_kritikus: keszlet,
        timestamp: new Date().toISOString(),
      });
    } else if (['szallitovezeto', 'admin'].includes(role)) {
      const kpi = await getKpiSummary();
      const fuvarok = await getFuvarList(10);
      const alkalmazottak = await getAlkalmazottakStatus();

      return NextResponse.json({
        kpi,
        fuvar_list: fuvarok,
        alkalmazottak,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'invalid_role' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: 'failed_to_fetch' },
      { status: 500 }
    );
  }
}
```

---

## 4. Notification Trigger Events

These events should call `/api/notifications/push` from various modules.

### Fuvar Completion
```typescript
// lib/fuvarozas/actions.ts
export async function completeMegallas(fuvar_id: string, megallas_index: number) {
  const fuvar = await db.fuvar.update({ id: fuvar_id, ... });
  
  if (fuvar.all_megallok_complete) {
    // Trigger notification
    await fetch('http://localhost:3000/api/notifications/push', {
      method: 'POST',
      body: JSON.stringify({
        user_id: fuvar.assigned_to,
        type: 'fuvar_completed',
        title: `${fuvar.customer_name} fuvar lezárva`,
        body: `Osszes megálló befejezve`,
        priority: 'high',
        data: { fuvar_id, action_url: `/fuvarozas/${fuvar_id}` },
      }),
    });
  }
}
```

### Számla Overdue
```typescript
// lib/szamlak/scheduler.ts (runs hourly)
export async function checkOverdueSzamlak() {
  const overdue = await db.szamla.findMany({
    where: { due_date: { lt: new Date() }, status: 'open' }
  });

  for (const szamla of overdue) {
    await fetch('http://localhost:3000/api/notifications/push', {
      method: 'POST',
      body: JSON.stringify({
        user_id: szamla.owner_user_id,
        type: 'szamla_lejart',
        title: `${szamla.partner_name} — ${szamla.amount} Ft lejárt`,
        body: `Lejárt: ${szamla.due_date.toLocaleDateString('hu-HU')}`,
        priority: 'normal',
        data: { action_url: `/szamlak/${szamla.id}` },
      }),
    });
  }
}
```

### Készlet Critical
```typescript
// lib/keszlet/monitoring.ts
export async function monitorKeszletLevels() {
  const criticalItems = await db.keszlet.findMany({
    where: { qty: { lte: db.raw(`min_qty`) } }
  });

  for (const item of criticalItems) {
    const manager = await getUserByRole('szallitovezeto');
    
    await fetch('http://localhost:3000/api/notifications/push', {
      method: 'POST',
      body: JSON.stringify({
        user_id: manager.id,
        type: 'keszlet_kritikus',
        title: `${item.name} — Kritikus szint`,
        body: `Jelenleg: ${item.qty} db, Minimum: ${item.min_qty} db`,
        priority: 'normal',
        data: { action_url: `/keszlet` },
      }),
    });
  }
}
```

---

## 5. Widget Refresh Notification

### POST /api/widgets/refresh
Called from backend when widget data changes (e.g., after fuvar completion).

**Request Body:**
```json
{
  "widget_ids": ["lock_screen", "home_screen"],
  "user_id": "user_123"
}
```

**Implementation:**
```typescript
// Trigger widget refresh on iOS
export async function refreshWidgets(user_id: string) {
  const user = await db.user.findUnique({ where: { id: user_id } });
  
  // Send silent push notification to trigger widget refresh
  await fetch('http://localhost:3000/api/notifications/push', {
    method: 'POST',
    body: JSON.stringify({
      user_id,
      type: 'widget_refresh',
      title: '', // Silent notification
      body: '',
      priority: 'high',
      data: { silent: true },
    }),
  });
  
  // Also call WidgetCenter.reloadAllTimelines() on iOS side
}
```

---

## 6. Dashboard Role-based Data

### GET /api/dashboard/role/:role
Main dashboard data for web-app (used by Attekintes modul).

**Response structure:**
```typescript
interface DashboardData {
  role: 'soffor' | 'szallitovezeto' | 'konyvelő' | 'admin';
  kpi: KPIData;
  fuvar: FuvarWidgetData;
  szamla: SzamlaWidgetData;
  keszlet: KeszletWidgetData;
  posta?: PostaWidgetData;
  alkalmazottak?: AlkalmazottakData;
}
```

**Implementation in web-app:**
```typescript
// components/attekintes/dashboard.tsx
export async function AttekintesView() {
  const session = await requireSession();
  const dashboardData = await fetch(
    `/api/dashboard/role/${session.role}`
  ).then(r => r.json());

  return (
    <div>
      <KpiBanner data={dashboardData.kpi} />
      <FuvarWidget data={dashboardData.fuvar} />
      <SzamlaWidget data={dashboardData.szamla} />
      {/* ... */}
    </div>
  );
}
```

---

## 7. Environment Variables (.env.local)

```bash
# APNs Configuration
APN_KEY_PATH=/path/to/AuthKey_KEYID.p8
APN_KEY_ID=XXXXXXXXXX
APN_TEAM_ID=XXXXXXXXXX

# iOS App Configuration
iOS_BUNDLE_ID=com.wwp.app
iOS_APP_GROUP=group.com.wwp.app

# Notification Settings
NOTIFICATION_RETRY_ATTEMPTS=3
NOTIFICATION_TIMEOUT_MS=5000
```

---

## 8. Database Schema Updates

```sql
-- Users table: add device token storage
ALTER TABLE users ADD COLUMN apns_device_token VARCHAR(255);
ALTER TABLE users ADD COLUMN last_push_sent TIMESTAMP;

-- Devices table: track iOS devices
CREATE TABLE devices (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  device_token VARCHAR(255) NOT NULL,
  device_type VARCHAR(50), -- "iOS", "iPad", "Mac"
  os_version VARCHAR(50),
  app_version VARCHAR(50),
  registered_at TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, device_token)
);

-- Notifications table: audit trail
CREATE TABLE push_notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR(50),
  title VARCHAR(255),
  body TEXT,
  status VARCHAR(50), -- "sent", "failed", "expired"
  sent_at TIMESTAMP DEFAULT NOW(),
  error_message TEXT
);
```

---

## 9. Testing Guide

### Manual Testing (cURL)
```bash
# Test push notification
curl -X POST http://localhost:3000/api/notifications/push \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "type": "fuvar_completed",
    "title": "Test Notification",
    "body": "This is a test",
    "priority": "high",
    "data": { "action_url": "/fuvarozas/f456" }
  }'

# Get widget data
curl http://localhost:3000/api/widgets/data/soffor
```

### Integration Test (Jest)
```typescript
describe('Notification API', () => {
  test('POST /api/notifications/push sends notification', async () => {
    const res = await fetch('http://localhost:3000/api/notifications/push', {
      method: 'POST',
      body: JSON.stringify({
        user_id: 'test_user',
        type: 'fuvar_completed',
        title: 'Test',
        body: 'Body',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.notification_id).toBeDefined();
  });
});
```

---

## 10. Deployment Checklist

- [ ] APNs certificate obtained and configured
- [ ] Environment variables set (production)
- [ ] Database schema updated (devices, push_notifications tables)
- [ ] API endpoints tested (manual + integration tests)
- [ ] Push notification quota checked (Apple limits)
- [ ] Widget data API responds < 100ms
- [ ] Error handling & retry logic in place
- [ ] Monitoring & logging set up
- [ ] Documentation updated (this file)
