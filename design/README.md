# Handoff: Timo Time Tracker — mobile apps (iOS + Android), company admin, system admin

## Overview
Timo records working time automatically based on presence. Every Timo beacon broadcasts the same iBeacon **proximity UUID**. The **major** identifies the company and the **minor** identifies one beacon, and through it a location and spot. When an employee's phone enters a company beacon region, a time registration starts (**check-in**). When the phone leaves the region, the registration stops (**check-out**). Every check-in and check-out gives the employee a **sound**, a **local notification** and, if the app is in the foreground, an **on-screen confirmation (bottom sheet)**.

The product has four surfaces:
1. **Mobile app (iOS + Android)**: sign-in via magic link or company SSO, registration, permission onboarding, home/status, confirmations, registrations list with filters, registration detail, correction requests, profile/settings.
2. **Company admin (web)**: live presence and occupancy, weekly timesheets with approval, "needs attention" (missing check-outs, correction requests), payroll export, locations and beacons (link supplied beacons to spots, request new beacons), people and invites.
3. **Timo system admin (web, internal)**: register companies (assigns the **major**), program beacons (assigns **minors**), beacon inventory, and fulfilment of beacon requests.
4. **Backend/API**: serves all of the above.

## About the design files
The files in `design/` are **design references created in HTML**: interactive prototypes that show the intended look and behaviour. They are **not production code to copy**. The task is to **recreate these designs** in the target stack. If no codebase exists yet, a suggested stack:
- **Mobile**: native Swift/SwiftUI (iOS) and Kotlin/Jetpack Compose (Android). Beacon region monitoring in the background is the core feature, and native code handles it most reliably. React Native or Flutter work too, but the beacon/region layer must then be a native module on each platform.
- **Web admins**: React + TypeScript (for example Next.js or Vite), with one app and role-based routing for company admin and system admin, or two apps that share a UI package.
- **Backend**: a REST or GraphQL API (Node/TypeScript, Kotlin or similar) with PostgreSQL, magic-link auth plus OIDC/SAML SSO for companies, and push notifications (APNs/FCM) for admin-initiated messages.

To view the prototypes, serve the `design/` folder with any static server (for example `npx serve design`) and open `Timo Overview.dc.html`. It shows every surface on one canvas with an EN/NL toggle. `Timo Mobile.dc.html`, `Timo Admin.dc.html` and `Timo System Admin.dc.html` also open on their own. The phones include a **beacon simulator** (Walk in / Leave per beacon, app open vs. locked, +1h clock).

## Fidelity
**High-fidelity.** Colours, typography, spacing, copy and interactions are final. Recreate them pixel-accurately, but use native platform controls where the design mirrors the OS (status bar, system permission dialogs, lock-screen notifications, switches). Those are drawn only to show which platform element is meant.

## Screenshots
All screenshots are in `screenshots/`. Mobile screenshots are 2× (848×1708 including the device frame); web screenshots are 1× at 1320px wide.

```
screenshots/
  mobile-ios/        01-login … 13-lock-notification  (+ options/ for rejected confirmation styles)
  mobile-android/    01-login … 13-lock-notification
  company-admin/     01-presence, 02-timesheets, 03-needs-attention, 04-export, 05-locations-beacons, 06-people
  system-admin/      01-companies, 02-beacon-inventory, 03-requests
```
`mobile-ios/options/confirm-full-screen.png` and `confirm-banner.png` show the **rejected** alternatives. The chosen confirmation is the **bottom sheet** (`08-confirm-sheet.png`).

---

## Domain model and beacon logic

### Beacon identity
| Field | Value | Set by |
|---|---|---|
| Proximity UUID | `5A4B0C1E-7F3D-4E2A-9B61-0D8C2E4F7A10` (identical for every Timo beacon) | Timo, constant |
| Major (uint16) | One per company, assigned sequentially at company registration (example: Northpier Logistics = `1042`) | System admin |
| Minor (uint16, 1–65535) | One per physical beacon, unique within the major, assigned sequentially at programming | System admin |

Company admins **cannot** create beacon IDs. They receive programmed beacons ("Supplied"), mount them, and link each one to a **location + spot + placement** (Entrance / Zone). They can **request** extra beacons, which the system admin programs and ships.

### Beacon lifecycle
`in stock` (no major/minor) → **program** (system admin writes UUID + major + next free minor) → `shipped` → `supplied` (delivered to the company, not yet placed) → company admin **activates** (links it to a location/spot) → `active` → `low battery` (<20%) / `offline` (not seen for more than 1 h).

### Check-in / check-out rules (app + backend)
- **Entering** a region with UUID + the company's major, while not checked in, starts a check-in at that minor's location. Timestamp = time of the enter event.
- **Leaving** the region: after a **grace period** (suggested 3 min, configurable per company) without the beacon being seen again, the app checks out. Timestamp = time the beacon was **last seen**, not the end of the grace period.
- **Entering a different minor** while checked in closes the current registration at that moment and opens a new one at the new location. The prototype behaves this way. Beacons marked "Zone" could instead be used only to track location without splitting the registration; this is a product decision to confirm.
- **Same minor again** while inside: no-op.
- **No exit detected by 23:59 local time**: the registration is closed at 23:59 with status `auto`. It shows as "Auto check-out · review" in the app and under **Needs attention → Missing check-outs** in the admin, and it is excluded from totals until it is resolved.
- Beacons with a major that doesn't belong to the user's company are ignored.
- The app must work **fully in the background and when the phone is locked**. Queue events offline and sync them with their original timestamps.
- Every event is sent to the backend with: userId, deviceId, uuid, major, minor, type (enter/exit), timestamp, RSSI (optional) and the app's local sequence number (for deduplication).

### Platform implementation notes
- **iOS**: monitor a `CLBeaconRegion` with UUID + major (one region per company, which stays well inside the 20-region limit). On `didEnterRegion`, start short ranging (`CLBeaconIdentityConstraint`) to resolve the minor. On `didExitRegion`, apply the grace period. Requires "Always" location permission plus the `NSLocationAlwaysAndWhenInUseUsageDescription` and `NSBluetoothAlwaysUsageDescription` strings. Enter/exit events wake the app when it has been terminated.
- **Android**: use the AltBeacon Android Beacon Library (or equivalent) with region monitoring in a foreground service. Requires `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION` ("Allow all the time", which on Android 11+ must be requested in a separate step, as the onboarding shows) and `POST_NOTIFICATIONS` (13+). Guide users to exclude the app from battery optimisation where needed.
- **Sound**: a short two-tone chime. **Check-in** rises (D5 587 Hz → A5 880 Hz); **check-out** falls (A5 → D5). Sine wave, about 150 ms per tone, 0.6 s decay. Ship it as a bundled audio file used for both the local notification sound and the in-app sound. It respects the "Check-in sounds" toggle and the device's silent mode.
- **Notifications**: local notifications fired by the app on each check-in and check-out (don't wait for a server push).
  - Check-in: title `Checked in · HQ Utrecht`, body `Time registration started at 07:58 · Main entrance`.
  - Check-out: title `Checked out · HQ Utrecht`, body `Registered 8h 12m · Main entrance`.
  - Tapping the notification opens the app on Home.

### Data model (suggested)
- `Company` { id, major (unique uint16), name, status: onboarding|active, selfRegistrationCode (e.g. `NP-1042`), ssoConfig?, graceMinutes, createdAt }
- `Location` { id, companyId, name (e.g. "HQ Utrecht"), capacity (workplaces), timezone }
- `Beacon` { id, serial (e.g. `TB-26-04113`), major?, minor?, companyId?, locationId?, spot (e.g. "Main entrance"), placement: entrance|zone, status: stock|shipped|supplied|active|low|offline, battery %, firmware, lastSeenAt }
- `BeaconRequest` { id (e.g. `R-0091`), companyId, quantity, locationId, note, requestedBy, status: requested|shipped|delivered, assignedMinors[] }
- `User` { id, companyId?, name, email, team, role: employee|manager|company_admin|system_admin, contractHours/week, status: invited|active }
- `Device` { id, userId, platform, model, pushToken, lastSeenAt }
- `BeaconEvent` (raw, append-only) { id, userId, deviceId, major, minor, type: enter|exit, at, rssi?, seq }
- `Registration` { id, userId, beaconId (minor), locationId, checkInAt, checkOutAt?, status: open|ok|auto|pending, source: beacon|manual_correction }
- `CorrectionRequest` { id, registrationId?, userId, type: forgot_checkout|wrong_times|missing, requestedIn, requestedOut, note, status: pending|approved|declined, decidedBy, decidedAt }. The original times are always kept (audit trail).
- `TimesheetApproval` { userId, weekIso, approvedBy, approvedAt }
- `Export` { id, companyId, period, format, grouping, fields, fileName, createdBy, createdAt }

### Roles and permissions
- **Employee**: own registrations and correction requests only.
- **Manager**: approve timesheets and corrections for their team(s).
- **Company admin**: everything inside their company (major), including exports, beacon linking and requests, invites.
- **System admin (Timo)**: all companies; can create companies, program beacons and fulfil requests; no access to individual time data unless explicitly granted.

### Privacy (NL/EU context)
The only data stored is enter/exit at registered beacons — **no GPS positions and no location history**. This is stated in onboarding and in the profile. Plan for a GDPR/AVG privacy notice and a data-retention policy. Dutch employers usually need **works council (OR) consent** for time-tracking systems, so document this for customers.

---

## Design tokens (Industry design system)
Source: `design/_ds/industry-…/styles.css`. The prototype writes these values inline as literals.

**Colours**
| Token | Hex | Use |
|---|---|---|
| bg | `#f2f2f3` | App/page ground, and text on the primary button |
| surface | `#e9e9ea` | Input fills, Android nav bar, system-admin sidebar |
| text | `#1d1f20` | Primary text, selected segmented/nav fill |
| muted text | `#5d5d60` (neutral-700) | Secondary text, kickers |
| subtle text | `#7a7a7d` (neutral-600) | Placeholders, version line |
| divider | `rgba(29,31,32,.16)` | Every hairline border |
| corner mark | `#8b8c8e` | "+" registration marks |
| accent | `#5980a6` | Primary button fill, active state, bars |
| accent-600 | `#597ea3` | Primary hover |
| accent-700 | `#416180` | Primary pressed; accent-coloured text/links/icons |
| accent-800 | `#2c455d` | Text on accent tints |
| accent-900 | `#1d2d3d` | Full-bleed fields (lock screen, full-screen confirm), "alert" tag fill, count badges |
| accent-100 / 200 / 300 / 400 / 500 | `#eef6ff` / `#d6ebff` / `#b5d9fd` / `#94bce3` / `#749dc4` | Tints: info boxes, selected chips, Android nav pill, rings |
| neutral-200 / 300 / 400 / 500 | `#e7e7ea` / `#d4d4d7` / `#b7b7ba` / `#98989b` | Track backgrounds, iOS switch off, sheet grabber, chevrons |

The palette is monochrome: there is **no red, green or amber**. Status is carried by the tag style:
- "ok" = neutral-200 fill with a hairline border.
- "ready/info" = accent-100 fill, accent border, accent-700 text.
- "alert" = accent-900 fill with bg-coloured text.

**Typography**
- Headings: **Barlow Condensed 600** (500 for big numerals). Body: **Barlow 400/500/600**. Monospace (IDs, UUIDs, beacon logs, export preview): `ui-monospace, Menlo, monospace`.
- Mobile scale:
  - Hero timer 64 / lh .95, tabular-nums; confirmation time 30.
  - Screen title (iOS large title) 36; Android top-app-bar title 24 / 500.
  - Section heading 32–36; card numerals 28.
  - Row time 19 condensed.
  - Body 15–16, secondary 14, kicker 12 uppercase with +0.08em tracking.
- Web scale:
  - Page title 38; KPI numerals 44; section heading 22.
  - Table body 14; table header 12 uppercase with +0.06em tracking.
  - Meta text 12–13.

**Shape, spacing, elevation**
- Cards, figures and primary buttons are **square** (radius 0), with a 1px hairline border and **"+" registration marks** at each corner. A mark is 11×11px, two 1px lines, offset −6px outside the box. Cards have **no fill**.
- Inputs, secondary buttons and segmented controls use a 4px radius.
- OS chrome follows the platform:
  - iOS sheet: 14px top corners.
  - iOS alert: 14px radius.
  - Android dialog: 28px radius.
  - Notifications: 20px (iOS) / 24px (Android).
  - Android nav pill: 16px.
- Spacing scale (0.85 density): 3.4 / 6.8 / 10.2 / 13.6 / 20.4 / 27.2 px. The mobile screen padding is 20–24px and gaps between sections are 22–28px.
- Shadows:
  - sm `0 1px 2px rgba(43,43,45,.14)`
  - md `0 3px 10px rgba(43,43,45,.16)`
  - lg `0 12px 32px rgba(43,43,45,.22)` (banners, dialogs)
- Focus ring: `2px solid #5980a6`, offset 2px.

**Icons**: Lucide at **stroke-width 1.5** (2 in status bars). Names used include:
- Navigation and chrome: house, list-checks, circle-user, chevron-left/right, arrow-left.
- Beacons and location: radio-tower, bluetooth, bluetooth-searching, map-pin, map-pin-off.
- Check-in/out and time: log-in, log-out, hourglass, clock, calendar-range.
- Actions and forms: mail, mail-check, inbox, building-2, pencil-line, send, download, user-plus, package-plus, cpu, truck, check, check-check, x.
- Status and info: triangle-alert, info, bell, volume-2, volume-x, lock, lock-open, shield-check, languages, layers, boxes, file-spreadsheet.

**Brand mark**: the wordmark `TIMO` is set in Barlow Condensed 600 with 0.14em tracking, inside a hairline box with corner marks. It is preceded by the beacon glyph: a 0.72em circle with a 1px `#749dc4` ring, a second 1px `#d4d4d7` ring 0.24em outside it, and a 0.26em `#5980a6` square in the centre.

---

## Mobile app: screens
The device canvas in the prototype is 370×800 pt. iOS has a 54pt status bar, Dynamic Island, a large-title navigation bar, an 84pt tab bar and a home indicator. Android has a 40dp status bar, a punch-hole camera, a 64dp Material top app bar, a 92dp navigation bar with a 64×32 pill indicator and a gesture bar.

### 01 Login (`screenshots/*/01-login.png`)
- Top to bottom: brand mark; headline "Time registration that starts when you walk in." (34 condensed); "Work email" field (48h); **primary** "Email me a sign-in link" (50h, mail icon); an "or" divider; **secondary** "Sign in with company SSO" (building-2 icon); footer "No account yet? **Register**".
- Behaviour:
  - The magic link goes to the entered email and opens the magic-link screen.
  - SSO: look up the company by email domain, or ask for the company code, then run OIDC/SAML.

### 02 Register
- Back link "‹ Sign in".
- Title "Create account", subtitle "We'll email you a sign-in link — no password needed."
- Fields: Full name, Work email, Company code (optional, monospace, uppercased, e.g. `NP-1042`, with help text "Invited by your employer? The code is in your invite email.").
- Primary "Send magic link".
- Without a company code, the account is personal/unaffiliated. Beacons then do nothing until the user joins a company (open question: see the end of this document).

### 03 Magic link sent
- Framed mail-check icon; "Check your inbox"; "We sent a sign-in link to **{email}**. It expires in 15 minutes."
- Primary "Open mail app"; ghost "Resend link"; "Use a different email".
- (The dashed "demo: open the link" button is prototype-only.)
- Validity: 15 minutes, single use. Use universal links (iOS) and app links (Android).

### 04–05 Onboarding (3 steps) and system dialogs
- Header: "SETUP · n/3" with three 28×3 progress bars.
- A framed illustration box (210h) with a pulsing ring animation (2.4 s ease-out, two staggered rings) around the icon.
- Title and explanation, then primary "Continue" and ghost "Not now".
- Steps:
  1. **Find beacons nearby** (bluetooth): "Timo listens for Timo beacons at your workplace entrances. Nothing is tracked anywhere else."
  2. **Location — always** (map-pin): "Needed to detect beacons while the app is closed. Timo never stores your GPS position." On Android the button reads "Allow all the time".
  3. **Check-in notifications** (bell): "Get a notification and a sound every time you are checked in or out."
- "Continue" triggers the **real OS permission prompt**; the screenshots show the iOS alert and the Android dialog. After step 3, go to Home. If a permission is denied, show a persistent warning on Home and in Profile with a deep link to Settings (not designed yet).

### 06 Home: status (chosen default) · 07 Home: timeline (alternative)
- **06, status variant**:
  - Kicker with the date ("THURSDAY 24 SEPTEMBER") and a greeting ("Good morning, Sanne"; afternoon from 12:00, evening from 18:00).
  - Status card (blueprint card):
    - Checked in: state label "CHECKED IN" with an 8px square and a pulsing ring, beacon ID `1042 · 1` top right, a live timer `HH:MM:SS` updated every second, the location name, and "spot · since 07:58".
    - Not checked in: radio-tower icon with a pulse and "Walk past a Timo beacon at the entrance to start your registration."
  - Two cells: TODAY total, and THIS WEEK total with a progress bar against contract hours ("of 40h contract").
  - "TODAY'S REGISTRATIONS" rows (time range, location · spot, duration, chevron) that open the detail screen, and a link "Missing a registration?" that opens Registrations filtered to "Needs attention".
- **07, timeline variant**: a big "today" total; a 07:00–19:00 day track with segments (a running segment is hatched) and a "now" line; a current-location card; and five weekly bars Mon–Fri (the current day in solid accent, other days in accent-300, and a day with an auto check-out hatched and labelled "?").
- Totals exclude `auto` registrations.

### 08 Check-in / check-out confirmation: **bottom sheet (chosen)**
- Shown when the app is in the foreground at the moment of an enter/exit event. Plays the chime at the same time.
- Layout:
  - Scrim `rgba(29,31,32,.32)`; the sheet slides up (350 ms, `cubic-bezier(.2,.9,.3,1)`).
  - Grabber 36×5.
  - Accent square icon (56, log-in/log-out) with the title "Checked in"/"Checked out" (30 condensed) and a subtitle ("Your time registration started" / "Registration saved").
  - A two-cell grid: TIME (e.g. 07:58) and BEACON `1042·1` for check-in, or WORKED `8h 12m` for check-out; then a full-width row with a map-pin, the location and the spot.
  - Primary "Done"; ghost "Not right? Request a correction", which opens the detail screen of that registration.
- Dismissal: tap Done, tap the scrim, or swipe down. It also closes on its own after **6 s**.
- If the app is in the background or the phone is locked, only the local notification is shown (screenshot 13).

### 09 Registrations
- Large title "Registrations".
- Segmented control (3 equal cells): This week / Last week / {Month}.
- Horizontally scrolling chips: All · HQ Utrecht · Amsterdam Hub · **Needs attention** (a toggle that shows only `auto` and `pending`). The location chips are generated from the company's locations.
- Summary: the total for the filter (30 condensed) and "N registrations".
- Days grouped with a header ("Wednesday 23 Sep", day total) over a 1px text-coloured rule. Rows show the time range (19 condensed), location · spot, duration and an optional tag ("Auto check-out · review", "Correction pending", "Running").
- A tapped row opens the detail screen. When the filter has no results: "No registrations match these filters."

### 10 Registration detail
- Date kicker; big duration (60 condensed, "—" when `auto`); tag.
- Blueprint card with the check-in time (log-in icon), a connector line, and the check-out time.
- Definition rows: Location (name + spot); Beacon (`major 1042 · minor 1`, UUID truncated); Source ("Automatic — beacon enter and exit", "Closed at 23:59 — no exit detected" or "Automatic — still inside").
- If a correction is pending: an info box "Your manager is reviewing a correction for this registration." Otherwise a secondary "Request correction" button. There is no correction button while the registration is still running.

### 11 Request correction
- Context line: date · range · location.
- Radio list "What's wrong?": I forgot to check out / Times are wrong / Registration is missing.
- Time inputs "Correct check-in" and "Correct check-out"; textarea "Note for your manager" (placeholder "e.g. Phone battery died at 17:30").
- Info: "The original times stay on record. Your manager approves or declines the change."
- Primary "Send request". On success the registration status becomes `pending`, the app returns to the detail screen and shows the toast "Correction sent to your manager" (dark toast, 2.6 s).
- Validation: check-out must be after check-in, both times on the same day, maximum duration 16 h.

### 12 Profile and settings
- Identity: initials in a framed square, name, email, "Company · Team".
- TRACKING section:
  - Background detection: Active.
  - Check-in sounds: toggle.
  - Notifications: toggle.
  - Nearby beacons: `1042/1 · −61 dBm` (debug info).
- GENERAL section: Language (English/Nederlands, switches the whole app), Permissions ("All granted"), Privacy text.
- Secondary "Sign out" and the version line.
- Switches are native: an iOS switch (51×31) and a Material 3 switch (52×32, with a thumb of 16 when off and 24 when on).

### 13 Lock screen notification
- Shows the OS-rendered local notification on a lock screen: an app icon tile "TIMO", the title, the body and the time. This is a reference for the notification content only, not UI to build.

---

## Company admin (web): screens
Layout: a 236px left sidebar and fluid main content, designed at 1320×880 or more.
- **Sidebar**: brand mark; company name and `major 1042 · 3 locations`. Navigation items are 38h with a 4px radius; the selected item is filled `#1d1f20` with bg-coloured text; count badges are accent-900. At the bottom: EN/NL toggle and the user.
- **Main area**: a 12px uppercase kicker and a 38px title.

1. **Presence**
   - KPI strip of three cells, each clickable:
     - In now, "of N active", with a per-location split.
     - Expected, not in (with names).
     - Needs attention (opens that page).
   - Three location cards: name, minors, "in now / capacity workplaces", occupancy bar, % and "Peak today HH:MM · n". Clicking a card filters the table below, and a removable chip shows the active filter.
   - Table "Checked in now": Employee (name + team), Location (name + spot), Since, Duration (live).
   - Right column (300px): "Beacon events" feed (time, icon, "name checked in · location, spot (minor)").
2. **Timesheets**
   - Week switcher (‹ Week 39 · 21–27 Sep ›) and team chips.
   - Primary "Approve all ready (n)".
   - Table: Employee, Mon–Fri hours (decimal, "?" for an auto day, today in accent-700), Total, Contract, +/−, Status tag (Approved / Ready / Review), and a row "Approve" button when the status is Ready.
   - Selecting a row fills a blueprint card below with that employee's raw registrations per day.
   - Status logic: a sheet is **Review** when there is an open missing check-out or correction; **Ready** when all is clean and not yet approved; **Approved** after approval.
3. **Needs attention** (two columns)
   - **Missing check-outs**: a card per item with name, day, location, "07:58 – 23:59", an inline time input "Check-out at", **Save**, and "Ask employee" (sends a push or email asking the employee to submit a correction).
   - **Correction requests**: a card per item with Recorded (struck through) → Requested, the employee's note, and **Approve** / **Decline**.
   - Both actions update the registration and are logged in the audit trail.
4. **Export**
   - Left column (380px):
     - Period segmented control (Week 39 / Week 38 / September; add custom dates).
     - Format grid of six options: CSV (UTF-8, `;`), Excel, AFAS Profit, Nmbrs, Loket.nl, JSON/API.
     - "One row per" (Registration / Employee per day / Employee per period).
     - "Include" checkboxes: Location & beacon IDs; Corrections (audit trail); Overtime vs. contract; Approved hours only.
     - Primary "Export · N rows".
     - Info box when unapproved timesheets would be excluded.
   - Right column: live preview table (monospace), file name (`northpier_hours_2026-W39_csv.csv`), "+ N more rows" and "Recent exports".
   - The exact field mappings for the AFAS, Nmbrs and Loket.nl import formats must be checked against their documentation. The designs only show them as target options.
5. **Locations & beacons**
   - Three-cell header: Proximity UUID (constant), Major (read-only, "assigned by Timo"), Minors (the company's allocated minors).
   - Table: Location/spot, Minor, Placement, Battery bar (accent; accent-900 below 20%), Last seen, Events today, Status (Online / Low battery / Offline).
   - **Supplied, not yet placed**: a card per beacon (Minor, serial) with Location select, Spot input, Placement select and **Activate**, which moves it into the table.
   - **Beacon requests** list with status. The primary action **Request beacons** opens a dialog (Quantity, For location, Note for Timo; info: "Timo programs new minor IDs under major 1042 and ships the beacons.").
6. **People**
   - Self-registration company code (`NP-1042`).
   - Primary "Invite people" opens a dialog: email addresses (comma/newline separated), Team, Contract hours, and the note that invitees get a magic link plus the company code.
   - Table: Employee (name + email), Team, Role, Contract, Device, Status (In now / Active / Invited).

## Timo system admin (web): screens
The layout is the same as the company admin, but the sidebar is filled `#e9e9ea` to distinguish it. A four-cell KPI strip sits on every page: Companies (major range), Beacons in field, In stock, Open requests.
1. **Companies**
   - Table: Major (20 condensed), Company + admin email, Locations, Beacons (active/total), Users, Status (Active / Onboarding).
   - A selected row shows a right-hand card (360px) listing the allocated minors, where each is placed and its status, plus "Program beacons for major N".
   - Primary **Register company** opens a dialog: Company name, First company admin email, **Major (assigned)** (the next free ID, shown read-only and fixed for that company), and First beacons quantity (showing the minor range, e.g. "minor 1–2"). This sends a magic link to the admin and creates the programmed beacons as shipped.
2. **Beacon inventory**
   - Filter chips with counts: All / Active / Supplied / Shipped / In stock.
   - Table: Serial, Major, Minor, Company, Placed at, Firmware, Battery, Status.
   - Primary **Program beacons** opens a dialog: pick the company (buttons), quantity, a preview of the UUID / major / next minors, and the info text. It takes units from stock, or registers new serials.
3. **Requests**
   - Open requests as cards: ID · date, company + major, location · requester, quantity, the note, "Minors to program" (the next free range), and primary **Program & ship**.
   - A "Handled" list below with the assigned minors and status (Shipped / Delivered).
   - Minor assignment must be atomic and unique per major (use a DB constraint and a sequence per major).

---

## Interactions and states (summary)
- **Hover**: secondary and ghost buttons and rows use a text tint at 4–7%. The primary button goes to accent-600 on hover and accent-700 when pressed. Disabled controls drop to 45% opacity.
- **Animations**:
  - Sheet slide-up 350 ms; banner drop 350 ms.
  - Fades 150–250 ms; dialog pop (scale .85 → 1) 200 ms.
  - Presence ping 2–2.6 s infinite (scale .7 → 2.4, opacity → 0).
- **Live values**: the mobile timer ticks every second; admin durations update every second (every minute is enough in production).
- **Toasts**: dark `#1d1f20` bar with a check icon, 2.6–2.8 s, used for approve, save, export, invite, activate and request.
- **Empty states**: already designed for the registrations filter, today's list, needs attention ("Nothing needs attention…") and supplied beacons.
- **Not designed yet (to do)**: denied permissions, Bluetooth off, no network/offline sync indicator, SSO error, expired magic link, and a user with no company.

## Localisation
The UI ships in **English and Dutch**. Every string is in the `T = { en: {…}, nl: {…} }` dictionaries in the logic blocks of `Timo Mobile.dc.html`, `Timo Admin.dc.html` and `Timo System Admin.dc.html`. Extract them into your i18n files (`Localizable.strings`, `strings.xml`, i18next JSON).
- Dates use `en-GB` and `nl-NL` formats.
- Durations are "8h 12m" in English and "8u 12m" in Dutch.
- Decimal hours use "8.5" in English and "8,5" in Dutch.
- Default to the device or browser locale.

## Suggested API surface
- Auth:
  - `POST /auth/magic-link` {email}
  - `POST /auth/magic-link/verify` {token}
  - `GET /auth/sso/:company` → OIDC
  - `POST /auth/register` {name, email, companyCode?}
- Mobile:
  - `GET /me`
  - `GET /me/beacon-config` → {uuid, major, beacons:[{minor, location, spot, placement}], graceMinutes}
  - `POST /events` (batched BeaconEvents, idempotent via deviceId + seq)
  - `GET /me/registrations?from&to&location&attention`
  - `GET /registrations/:id`
  - `POST /registrations/:id/corrections`
  - `POST /corrections` (missing registration)
- Company admin:
  - `GET /presence`
  - `GET /timesheets?week&team`
  - `POST /timesheets/:userId/:week/approve`
  - `GET /attention`
  - `PATCH /registrations/:id` (set check-out)
  - `POST /corrections/:id/approve|decline`
  - `POST /exports` → file
  - `GET /beacons`
  - `PATCH /beacons/:id` (link/activate)
  - `POST /beacon-requests`
  - `GET/POST /people`, `POST /invites`
- System admin:
  - `GET/POST /sys/companies` (the POST assigns the next major)
  - `GET /sys/beacons?status`
  - `POST /sys/beacons/program` {major, qty} → assigns the next minors
  - `GET /sys/requests`
  - `POST /sys/requests/:id/fulfil`
- Realtime: WebSocket or SSE for the presence page and the events feed.

## Files
```
design/
  Timo Overview.dc.html       ← start here: the canvas with every surface, EN/NL toggle
  Timo Mobile.dc.html         ← mobile app; props: platform ios|android, start, confirmStyle, homeVariant, sim, lang
  Timo Admin.dc.html          ← company admin; props: view, lang
  Timo System Admin.dc.html   ← Timo system admin; props: view, lang
  lu-icon.js                  ← <lu-i> Lucide icon element (stroke 1.5) and <bp-c> corner-mark element
  support.js                  ← prototype runtime (not needed in production)
  _ds/industry-…/styles.css   ← Industry design-system tokens
screenshots/                  ← see above
```
All sample data (Northpier Logistics, the employees, beacon IDs, hours, companies) is fictional.

## Open questions for the product owner
1. Should walking past a **Zone** beacon split a registration by location, or only record the location without a new registration?
2. What should the check-out grace period be (the suggestion is 3 min), and should it be set per company?
3. Users without a company: is personal/self-employed use in scope, and do such users buy their own beacons?
4. Breaks: should short exits under N minutes merge into one registration?
5. Which payroll formats are needed at launch?
