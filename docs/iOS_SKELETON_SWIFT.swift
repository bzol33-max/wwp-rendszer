// MARK: - iOS App Skeleton (Swift/SwiftUI)
// Location: wwp-app-ios/Sources/
// This file contains the main components for OPCIÓ 3 (Web + Minimal Native)

import SwiftUI
import WebKit
import UserNotifications
import WidgetKit

// MARK: - App Entry Point
@main
struct WwpApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onAppear {
                    // Request push notification permission on first launch
                    APNService.shared.requestUserPermission()
                }
        }
    }
}

// MARK: - App Delegate (APNs Handling)
class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set notification delegate
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // Handle remote notification (push from APNs)
    func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any]
    ) async -> UIBackgroundFetchResult {
        APNService.shared.handleRemoteNotification(userInfo)

        // Update widget timeline after push
        WidgetCenter.shared.reloadAllTimelines()

        return .newData
    }

    // Handle notification response (user tapped notification)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        let userInfo = response.notification.request.content.userInfo
        APNService.shared.handleNotificationResponse(userInfo)
    }

    // Handle foreground notification display
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        return [.banner, .sound, .badge]
    }
}

// MARK: - Content View (Root Tab Navigation)
struct ContentView: View {
    @State private var selectedTab: Int = 0

    var body: some View {
        ZStack {
            TabView(selection: $selectedTab) {
                // Dashboard Tab
                WebViewContainer(
                    url: URL(string: "https://web-production-91051.up.railway.app/attekintes")!
                )
                .tabItem {
                    Label("Áttekintés", systemImage: "chart.bar.fill")
                }
                .tag(0)

                // Fuvarozas Tab
                WebViewContainer(
                    url: URL(string: "https://web-production-91051.up.railway.app/fuvarozas")!
                )
                .tabItem {
                    Label("Fuvar", systemImage: "truck.box.fill")
                }
                .tag(1)

                // Keszlet Tab
                WebViewContainer(
                    url: URL(string: "https://web-production-91051.up.railway.app/keszlet")!
                )
                .tabItem {
                    Label("Készlet", systemImage: "box.2.fill")
                }
                .tag(2)

                // Profil Tab
                ProfileView()
                    .tabItem {
                        Label("Profil", systemImage: "person.fill")
                    }
                    .tag(3)
            }
            .accentColor(Color(red: 0.122, green: 0.611, blue: 0.451)) // Menta-antracit green
        }
    }
}

// MARK: - WebView Container
struct WebViewContainer: UIViewRepresentable {
    let url: URL
    @State private var webView: WKWebView?

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        // Add JavaScript message handler for native communication
        config.userContentController.add(
            context.coordinator,
            name: "wwpApp"
        )

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator

        // Load web-app
        let request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad)
        webView.load(request)

        self.webView = webView
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Update if URL changes
    }

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    // MARK: - WebView Coordinator
    class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        let parent: WebViewContainer

        init(_ parent: WebViewContainer) {
            self.parent = parent
        }

        // Handle messages from web-app
        func userContentController(
            _ userContentController: WKUserContentController,
            didReceive message: WKScriptMessage
        ) {
            guard message.name == "wwpApp" else { return }

            if let body = message.body as? [String: Any],
               let action = body["action"] as? String {
                print("Action from web-app: \(action)")

                // Route to native services
                switch action {
                case "requestGeolocation":
                    print("Web-app requested geolocation (use LocationManager)")
                case "requestCamera":
                    print("Web-app requested camera (use AVCaptureSession)")
                case "requestPushPermission":
                    APNService.shared.requestUserPermission()
                default:
                    break
                }
            }
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            print("WebView navigation error: \(error.localizedDescription)")
        }
    }
}

// MARK: - Profile View
struct ProfileView: View {
    @State private var userName: String = "Budaházi Zoltán"
    @State private var userRole: String = "Szállítóvezetõ"

    var body: some View {
        VStack(spacing: 20) {
            // User Info Card
            VStack(spacing: 12) {
                Image(systemName: "person.crop.circle.fill")
                    .font(.system(size: 48))
                    .foregroundColor(Color(red: 0.122, green: 0.611, blue: 0.451))

                Text(userName)
                    .font(.headline)

                Text(userRole)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)

            // Settings Section
            VStack(spacing: 12) {
                SettingRow(icon: "bell.fill", title: "Notifikációk", value: "Bekapcsolva")
                SettingRow(icon: "icloud.fill", title: "Szinkronizálás", value: "Bekapcsolva")
                SettingRow(icon: "moon.fill", title: "Sötét mód", value: "Automatikus")
            }
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)

            // Actions
            VStack(spacing: 8) {
                Button(action: {}) {
                    Text("App információ")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .foregroundColor(.blue)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                }

                Button(action: { logout() }) {
                    Text("Kijelentkezés")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .foregroundColor(.red)
                        .background(Color(.systemGray6))
                        .cornerRadius(8)
                }
            }

            Spacer()
        }
        .padding()
        .navigationTitle("Profil")
    }

    private func logout() {
        print("User logged out")
        // Clear cookies, localStorage, etc.
    }
}

struct SettingRow: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack {
            Image(systemName: icon)
                .foregroundColor(Color(red: 0.122, green: 0.611, blue: 0.451))
                .frame(width: 24)

            Text(title)
                .font(.body)

            Spacer()

            Text(value)
                .font(.caption)
                .foregroundColor(.secondary)

            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 8)
    }
}

// MARK: - APN Service
class APNService {
    static let shared = APNService()

    // MARK: Request User Permission
    func requestUserPermission() {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .sound, .badge]
        ) { granted, error in
            if let error = error {
                print("Notification permission error: \(error.localizedDescription)")
                return
            }

            if granted {
                print("Notification permission granted")
                DispatchQueue.main.async {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            } else {
                print("Notification permission denied")
            }
        }
    }

    // MARK: Handle Remote Notification (from APNs)
    func handleRemoteNotification(_ userInfo: [AnyHashable: Any]) {
        if let aps = userInfo["aps"] as? [String: Any] {
            let alert = aps["alert"] as? [String: Any]
            let title = alert?["title"] as? String ?? "WWP Notification"
            let body = alert?["body"] as? String ?? ""

            print("Push received: \(title) - \(body)")

            // Extract custom data
            let fuvarId = userInfo["fuvar_id"] as? String
            let actionUrl = userInfo["action_url"] as? String

            // Store for deep-link handling
            if let actionUrl = actionUrl {
                UserDefaults.standard.set(actionUrl, forKey: "pendingDeepLink")
            }
        }
    }

    // MARK: Handle Notification Response (user tapped)
    func handleNotificationResponse(_ userInfo: [AnyHashable: Any]) {
        if let actionUrl = userInfo["action_url"] as? String {
            print("Opening deep-link: \(actionUrl)")
            // Navigate to URL in WebView (via app state/routing)
            NotificationCenter.default.post(
                name: NSNotification.Name("DeepLinkReceived"),
                object: nil,
                userInfo: ["url": actionUrl]
            )
        }
    }
}

// MARK: - WidgetKit Components (in separate DashboardWidgets target)
/*
 Location: wwp-app-ios/Targets/DashboardWidgets/

 WidgetKit requires a separate target configuration:
 1. Create new WidgetKit extension target in Xcode
 2. Add to app group for data sharing
 3. Configure widget display (lock screen, home screen)
 */

// MARK: - Lock Screen Widget Data Provider
struct LockScreenEntry: TimelineEntry {
    let date: Date
    let fuvarActive: String?
    let szamlaLejart: (count: Int, osszeg: Int)?
    let keszletKritikus: [String]?
}

struct LockScreenProvider: TimelineProvider {
    func placeholder(in context: Context) -> LockScreenEntry {
        LockScreenEntry(
            date: Date(),
            fuvarActive: "Coca-Cola — 3/5",
            szamlaLejart: (3, 450000),
            keszletKritikus: ["EUR raklap"]
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (LockScreenEntry) -> ()) {
        let entry = LockScreenEntry(
            date: Date(),
            fuvarActive: nil,
            szamlaLejart: nil,
            keszletKritikus: nil
        )
        completion(entry)
    }

    func getTimelines(in context: Context, completion: @escaping ([Timeline<LockScreenEntry>]) -> ()) {
        // Fetch data from shared app group
        let sharedDefaults = UserDefaults(suiteName: "group.com.wwp.app")

        var entry = LockScreenEntry(
            date: Date(),
            fuvarActive: sharedDefaults?.string(forKey: "fuvarActive"),
            szamlaLejart: nil, // Parse from JSON if stored
            keszletKritikus: nil
        )

        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(15 * 60)))
        completion([timeline])
    }
}

// MARK: - Home Screen Widget
struct HomeScreenEntry: TimelineEntry {
    let date: Date
    let kpiData: [String: Int]?
    let fuvarList: [String]?
}

struct HomeScreenProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeScreenEntry {
        HomeScreenEntry(
            date: Date(),
            kpiData: ["napi_fuvarok": 12, "lejart_szamlak": 3],
            fuvarList: ["Coca-Cola", "Pepsi", "Fanta"]
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (HomeScreenEntry) -> ()) {
        let entry = HomeScreenEntry(date: Date(), kpiData: nil, fuvarList: nil)
        completion(entry)
    }

    func getTimelines(in context: Context, completion: @escaping ([Timeline<HomeScreenEntry>]) -> ()) {
        let sharedDefaults = UserDefaults(suiteName: "group.com.wwp.app")

        var kpiData: [String: Int] = [:]
        if let kpiJson = sharedDefaults?.data(forKey: "kpiData") {
            // Decode from JSON
        }

        let entry = HomeScreenEntry(
            date: Date(),
            kpiData: kpiData,
            fuvarList: []
        )

        let timeline = Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60)))
        completion([timeline])
    }
}

// MARK: - Info.plist Configuration
/*
 Required keys for wwp-app-ios/Info.plist:

 <dict>
     <key>CFBundleIdentifier</key>
     <string>com.wwp.app</string>

     <key>NSAppTransportSecurity</key>
     <dict>
         <key>NSAllowsArbitraryLoadsInWebContent</key>
         <true/>
         <key>NSExceptionDomains</key>
         <dict>
             <key>web-production-91051.up.railway.app</key>
             <dict>
                 <key>NSIncludesSubdomains</key>
                 <true/>
                 <key>NSExceptionAllowsInsecureHTTPLoads</key>
                 <false/>
             </dict>
         </dict>
     </dict>

     <key>UIApplicationSceneManifest</key>
     <dict>
         <key>UIApplicationSupportsMultipleScenes</key>
         <true/>
     </dict>

     <key>UILaunchScreen</key>
     <dict>
         <key>UIColorName</key>
         <string>MentaGreen</string>
     </dict>
 </dict>
 */

// MARK: - Package.swift (Xcode dependencies)
/*
 // swift-tools-version:5.9
 import PackageDescription

 let package = Package(
     name: "wwp-app-ios",
     platforms: [
         .iOS(.v15)
     ],
     dependencies: [
         .package(url: "https://github.com/Alamofire/Alamofire.git", from: "5.7.0"),
     ],
     targets: [
         .target(
             name: "WwpApp",
             dependencies: ["Alamofire"],
             path: "Sources"
         )
     ]
 )
 */
