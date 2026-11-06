// A small always-on-top window around the Agent Web page (?mini), with a menu bar item, notifications and a show/hide hotkey.
// Built on first use by web.ts into a small .app (so macOS allows notifications). Usage: agentweb-mini <url>
import Carbon
import Cocoa
import UserNotifications
import WebKit

final class Delegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKScriptMessageHandler, UNUserNotificationCenterDelegate {
  var window: NSWindow!
  var web: WKWebView!
  var url: URL!
  var titleObserver: NSKeyValueObservation?
  var status: NSStatusItem!
  let headItem = NSMenuItem(title: "Starting…", action: nil, keyEquivalent: "")
  let subItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
  var compactItem: NSMenuItem!
  var throughItem: NSMenuItem!
  var lastCls = ""
  var fullSize = NSSize(width: 480, height: 270)
  var snapWork: DispatchWorkItem?
  var hotKey: EventHotKeyRef?
  // notifications need a bundle id; run as a bare binary there is none, and they stay off
  lazy var notes: UNUserNotificationCenter? = Bundle.main.bundleIdentifier == nil ? nil : UNUserNotificationCenter.current()

  func applicationDidFinishLaunching(_ note: Notification) {
    guard CommandLine.arguments.count > 1, let u = URL(string: CommandLine.arguments[1]) else {
      FileHandle.standardError.write(Data("usage: agentweb-mini <url>\n".utf8))
      exit(2)
    }
    url = u
    let conf = WKWebViewConfiguration()
    // the page posts its status here: the menu bar and notifications read the same state the banner shows
    conf.userContentController.add(self, name: "lv")
    web = WKWebView(frame: .zero, configuration: conf)
    web.navigationDelegate = self

    window = NSWindow(contentRect: NSRect(origin: .zero, size: fullSize), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
    window.title = "Agent Web"
    window.level = .floating
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    window.contentMinSize = NSSize(width: 320, height: 180)
    window.isReleasedWhenClosed = false
    window.contentView = web
    window.delegate = self
    // the first time: the bottom-right corner of the main screen; after that, wherever it was left.
    // Saved per port, so each session's mini keeps its own place.
    let frameName = "AgentWebMini-\(u.port ?? 0)"
    let placed = window.setFrameUsingName(frameName)
    // a compact size saved last time, or a screen that is gone: start full size in the corner instead
    let onScreen = NSScreen.screens.contains { $0.visibleFrame.intersects(window.frame) }
    if !placed || !onScreen || window.contentRect(forFrameRect: window.frame).height < 180 {
      window.setContentSize(fullSize)
      if let screen = NSScreen.main?.visibleFrame {
        window.setFrameOrigin(NSPoint(x: screen.maxX - window.frame.width - 16, y: screen.minY + 16))
      }
    }
    window.setFrameAutosaveName(frameName)
    // the page title carries "(2 waiting)", so the title bar shows it too
    titleObserver = web.observe(\.title) { [weak self] w, _ in
      if let t = w.title, !t.isEmpty { self?.window.title = t }
    }
    web.load(URLRequest(url: url))
    // shown without taking focus from Claude
    window.orderFrontRegardless()

    setUpStatusItem()
    setUpHotKey()
    if let n = notes {
      n.delegate = self
      n.requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

  // MARK: the page

  // the server may still be starting, or restarting: try again
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) { retry(w) }
  func webView(_ w: WKWebView, didFail n: WKNavigation!, withError e: Error) { retry(w) }
  // WebKit's page process crashed or was killed under memory pressure: without this the window stays blank
  func webViewWebContentProcessDidTerminate(_ w: WKWebView) { retry(w) }

  func retry(_ w: WKWebView) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      if let u = self?.url { w.load(URLRequest(url: u)) }
    }
  }

  func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
    guard let d = m.body as? [String: Any], let cls = d["cls"] as? String, let head = d["head"] as? String else { return }
    let sub = d["sub"] as? String ?? "", short = d["short"] as? String ?? head
    let tint: [String: NSColor] = ["need": .systemYellow, "warn": .systemOrange, "slow": .systemOrange, "bad": .systemRed, "done": .systemGreen, "rest": .systemGreen]
    status.button?.attributedTitle = NSAttributedString(string: short, attributes: [
      .foregroundColor: tint[cls] ?? NSColor.labelColor,
      .font: NSFont.monospacedDigitSystemFont(ofSize: 12, weight: .semibold),
    ])
    headItem.title = head
    subItem.title = sub
    // a notification when the state turns into one you'd act on: someone needs you, something is stuck, the helpers are done.
    // None on launch, none for slow, a finished reply (rest) or No signal (Claude closing says that).
    if cls != lastCls {
      if !lastCls.isEmpty, ["need", "warn", "done"].contains(cls) { notify(head, sub) }
      lastCls = cls
    }
  }

  func notify(_ title: String, _ body: String) {
    guard let n = notes else { return }
    let c = UNMutableNotificationContent()
    c.title = title
    c.body = body
    n.add(UNNotificationRequest(identifier: UUID().uuidString, content: c, trigger: nil))
  }

  // clicking a notification goes back to Claude
  func userNotificationCenter(_ c: UNUserNotificationCenter, didReceive r: UNNotificationResponse, withCompletionHandler done: @escaping () -> Void) {
    DispatchQueue.main.async { self.back() }
    done()
  }

  func userNotificationCenter(_ c: UNUserNotificationCenter, willPresent n: UNNotification, withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
    done([.banner])
  }

  // MARK: menu bar

  func setUpStatusItem() {
    status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    status.button?.title = "○"
    let menu = NSMenu()
    menu.autoenablesItems = false
    headItem.isEnabled = false
    subItem.isEnabled = false
    menu.addItem(headItem)
    menu.addItem(subItem)
    menu.addItem(.separator())
    menu.addItem(item("Back to Claude", #selector(back)))
    menu.addItem(item("Show or hide window  ⌃⌥A", #selector(toggleWindow)))
    compactItem = item("Compact strip", #selector(toggleCompact))
    throughItem = item("Click-through", #selector(toggleThrough))
    menu.addItem(compactItem)
    menu.addItem(throughItem)
    menu.addItem(.separator())
    menu.addItem(item("Quit monitor", #selector(quit), key: "q"))
    status.menu = menu
  }

  func item(_ title: String, _ action: Selector, key: String = "") -> NSMenuItem {
    let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
    i.target = self
    return i
  }

  @objc func back() { web.evaluateJavaScript("backToClaude()") }

  @objc func toggleWindow() {
    if window.isVisible { window.orderOut(nil) } else { window.orderFrontRegardless() }
  }

  // a banner-only strip, about 300 x 64; the page stops drawing its canvas while it is on
  @objc func toggleCompact() {
    let on = compactItem.state != .on
    compactItem.state = on ? .on : .off
    let content = window.contentRect(forFrameRect: window.frame)
    if on { fullSize = content.size }
    let size = on ? NSSize(width: 300, height: 64) : fullSize
    window.contentMinSize = on ? NSSize(width: 220, height: 56) : NSSize(width: 320, height: 180)
    // keeps the top edge where it was, so the banner stays put
    let next = NSRect(x: content.minX, y: content.maxY - size.height, width: size.width, height: size.height)
    window.setFrame(window.frameRect(forContentRect: next), display: true)
    web.evaluateJavaScript("setCompact(\(on))")
  }

  // the window lets clicks through to what is under it; only the menu bar item or the hotkey bring it back. Off at every launch.
  @objc func toggleThrough() {
    let on = throughItem.state != .on
    throughItem.state = on ? .on : .off
    window.ignoresMouseEvents = on
    window.alphaValue = on ? 0.6 : 1
  }

  @objc func quit() { NSApp.terminate(nil) }

  // MARK: hotkey ⌃⌥A (Carbon's hotkeys need no Accessibility permission)

  func setUpHotKey() {
    var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
    InstallEventHandler(GetApplicationEventTarget(), { _, _, _ in
      DispatchQueue.main.async { delegate.toggleWindow() }
      return noErr
    }, 1, &spec, nil, nil)
    // another session's mini may hold it already; then only that one answers
    let id = EventHotKeyID(signature: OSType(0x4C56_4D4E), id: 1)
    RegisterEventHotKey(UInt32(kVK_ANSI_A), UInt32(controlKey | optionKey), id, GetApplicationEventTarget(), 0, &hotKey)
  }

  // MARK: snap to corners

  // once a move settles, a window within 40 pt of a screen edge lines up 16 pt from it
  func windowDidMove(_ n: Notification) {
    snapWork?.cancel()
    let w = DispatchWorkItem { [weak self] in self?.snap() }
    snapWork = w
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4, execute: w)
  }

  func snap() {
    // still being dragged: wait for the mouse to come up
    if NSEvent.pressedMouseButtons != 0 { windowDidMove(Notification(name: NSWindow.didMoveNotification)); return }
    guard let vf = window.screen?.visibleFrame else { return }
    let s = window.frame.size, m: CGFloat = 16, near: CGFloat = 40
    var o = window.frame.origin
    if abs(o.x - (vf.minX + m)) < near { o.x = vf.minX + m }
    if abs(vf.maxX - m - (o.x + s.width)) < near { o.x = vf.maxX - m - s.width }
    if abs(o.y - (vf.minY + m)) < near { o.y = vf.minY + m }
    if abs(vf.maxY - m - (o.y + s.height)) < near { o.y = vf.maxY - m - s.height }
    if o != window.frame.origin { window.setFrameOrigin(o) }
  }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
