// A small always-on-top window around the Agent Web page (?mini).
// Built on first use by web.ts: swiftc -O MiniWindow.swift -o agentweb-mini. Usage: agentweb-mini <url>
import Cocoa
import WebKit

final class Delegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  var window: NSWindow!
  var web: WKWebView!
  var url: URL!
  var titleObserver: NSKeyValueObservation?

  func applicationDidFinishLaunching(_ note: Notification) {
    guard CommandLine.arguments.count > 1, let u = URL(string: CommandLine.arguments[1]) else {
      FileHandle.standardError.write(Data("usage: agentweb-mini <url>\n".utf8))
      exit(2)
    }
    url = u
    web = WKWebView(frame: .zero)
    web.navigationDelegate = self

    let size = NSSize(width: 480, height: 270)
    window = NSWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .resizable, .miniaturizable], backing: .buffered, defer: false)
    window.title = "Agent Web"
    window.level = .floating
    window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
    window.contentMinSize = NSSize(width: 320, height: 180)
    window.isReleasedWhenClosed = false
    window.contentView = web
    // the first time: the bottom-right corner of the main screen; after that, wherever it was left
    if !window.setFrameUsingName("AgentWebMini"), let screen = NSScreen.main?.visibleFrame {
      window.setFrameOrigin(NSPoint(x: screen.maxX - window.frame.width - 16, y: screen.minY + 16))
    }
    window.setFrameAutosaveName("AgentWebMini")
    // the page title carries "(2 waiting)", so the title bar shows it too
    titleObserver = web.observe(\.title) { [weak self] w, _ in
      if let t = w.title, !t.isEmpty { self?.window.title = t }
    }
    web.load(URLRequest(url: url))
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ app: NSApplication) -> Bool { true }

  // the server may still be starting: try again
  func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      if let u = self?.url { w.load(URLRequest(url: u)) }
    }
  }
}

let app = NSApplication.shared
let delegate = Delegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
