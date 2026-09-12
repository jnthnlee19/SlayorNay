import SwiftUI
import WebKit
import SafariServices
import ImageIO

private enum Bubblegum {
    static let canvas = UIColor(red: 1, green: 238/255, blue: 242/255, alpha: 1)
    static let ink = Color(red: 26/255, green: 26/255, blue: 26/255)
    static let pink = Color(red: 1, green: 45/255, blue: 141/255)
}

private let site = URL(string: "https://glossortoss.com/")!
private let initialSection: String = {
    let args = ProcessInfo.processInfo.arguments
    let requested = args.firstIndex(of: "--preview-section").flatMap { $0 + 1 < args.count ? args[$0 + 1] : nil } ?? "vote"
    return ["vote", "discover", "submit", "profile"].contains(requested) ? requested : "vote"
}()

@main
struct GlossOrTossApp: App {
    var body: some Scene { WindowGroup { MainView().preferredColorScheme(.light) } }
}

final class BrowserModel: ObservableObject {
    @Published var failure: String?
    @Published var loading = true
    let webView: WKWebView = {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.isOpaque = false
        view.backgroundColor = Bubblegum.canvas
        view.scrollView.backgroundColor = Bubblegum.canvas
        view.allowsBackForwardNavigationGestures = false
        return view
    }()
    func open(_ section: String) {
        failure = nil
        webView.load(URLRequest(url: URL(string: "?native=ios#" + section, relativeTo: site)!.absoluteURL))
    }
    func retry() { open("vote") }
}

struct MainView: View {
    @StateObject private var browser = BrowserModel()
    @State private var section = initialSection
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                AsyncImage(url: URL(string: "https://glossortoss.com/logo.png")) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() }.frame(width: 64, height: 64).accessibilityLabel("Gloss or Toss")
                Spacer()

                ShareLink(item: site) { Image(systemName: "square.and.arrow.up") }.accessibilityLabel("Share Gloss or Toss")
            }.padding(.horizontal).padding(.vertical, 10)
            ZStack {
                SiteView(model: browser)
                if browser.loading { ProgressView("Loading…").padding().background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12)) }
                if browser.failure != nil {
                    VStack(spacing: 18) {
                        Image(systemName: "wifi.exclamationmark").font(.largeTitle)
                        Text("Let’s reconnect").font(.title2)
                        Text("Check your connection and try again. Your saved votes are safe.").multilineTextAlignment(.center)
                        Button("Try again") { browser.retry() }.buttonStyle(.borderedProminent)
                    }.padding(30).frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(Bubblegum.canvas))
                }
            }
            HStack {
                tab("The Vote", "house.fill", "vote")
                tab("Explore", "magnifyingglass", "discover")
                tab("Submit", "plus.circle", "submit")
                tab("Profile", "person.crop.circle", "profile")
            }.padding(.top, 10).padding(.bottom, 6).background(Color.white)
        }.background(Color(Bubblegum.canvas)).foregroundStyle(Bubblegum.ink).tint(Bubblegum.pink)
    }
    private func tab(_ title: String, _ icon: String, _ target: String) -> some View {
        Button { section = target; browser.open(target) } label: {
            VStack(spacing: 4) { Image(systemName: icon); Text(title).font(.caption) }
                .frame(maxWidth: .infinity).foregroundStyle(section == target ? Bubblegum.pink : Bubblegum.ink).opacity(section == target ? 1 : 0.55)
        }.accessibilityAddTraits(section == target ? .isSelected : [])
    }
}

struct SiteView: UIViewRepresentable {
    @ObservedObject var model: BrowserModel
    func makeCoordinator() -> Coordinator { Coordinator(model) }
    func makeUIView(context: Context) -> WKWebView {
        model.webView.navigationDelegate = context.coordinator
        model.webView.uiDelegate = context.coordinator
        // Keep native navigation visible while hiding duplicate website chrome.
        let css = "header,footer,.bottom-nav{display:none!important}.native-shell .vote-page #vote-card{height:100%!important;min-height:0!important}"
        let script = "const style=document.createElement('style');style.textContent=" + String(data: try! JSONEncoder().encode(css), encoding: .utf8)! + ";document.head.appendChild(style);"
        model.webView.configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        model.webView.configuration.userContentController.addScriptMessageHandler(context.coordinator, contentWorld: .page, name: "shareImage")
        model.open(initialSection)
        return model.webView
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
        let model: BrowserModel
        init(_ model: BrowserModel) { self.model = model }
        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
            guard message.frameInfo.isMainFrame, message.frameInfo.securityOrigin.protocol == "https", message.frameInfo.securityOrigin.host == site.host,
                  let body = message.body as? [String: Any], let raw = body["image"] as? String,
                  raw.hasPrefix("data:image/png;base64,"), raw.count < 17_000_000,
                  let bytes = Data(base64Encoded: String(raw.dropFirst(22))), bytes.count <= 12 * 1024 * 1024,
                  let source = CGImageSourceCreateWithData(bytes as CFData, nil),
                  let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
                  let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
                  width > 0, height > 0, width <= 4096, height <= 4096,
                  let image = UIImage(data: bytes) else { replyHandler(nil, "Image unavailable."); return }
            guard var presenter = model.webView.window?.rootViewController else { replyHandler(nil, "Please try again."); return }
            while let presented = presenter.presentedViewController { presenter = presented }
            guard !(presenter is UIActivityViewController) else { replyHandler(nil, "A share menu is already open."); return }
            var items: [Any] = [image]
            if let text = body["text"] as? String, !text.isEmpty { items.append(String(text.prefix(500))) }
            if let rawURL = body["url"] as? String, let url = URL(string: rawURL), url.scheme == "https", url.host == site.host { items.append(url) }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            sheet.popoverPresentationController?.sourceView = model.webView
            sheet.popoverPresentationController?.sourceRect = CGRect(x: model.webView.bounds.midX, y: model.webView.bounds.midY, width: 1, height: 1)
            sheet.completionWithItemsHandler = { _, completed, _, error in
                if let error = error { replyHandler(nil, error.localizedDescription) } else { replyHandler(["cancelled": !completed], nil) }
            }
            presenter.present(sheet, animated: true)
        }
        func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { model.loading = true; model.failure = nil }
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { model.loading = false }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { failed(error) }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { failed(error) }
        private func failed(_ error: Error) { if (error as NSError).code != NSURLErrorCancelled { model.loading = false; model.failure = error.localizedDescription } }
        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url else { decisionHandler(.cancel); return }
            if url.scheme == "https", url.host == site.host { decisionHandler(.allow); return }
            decisionHandler(.cancel)
            if ["https", "mailto"].contains(url.scheme ?? ""), action.navigationType == .linkActivated { UIApplication.shared.open(url) }
        }
        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let url = navigationAction.request.url, url.scheme == "https" { UIApplication.shared.open(url) }
            return nil
        }
    }
}
