import SwiftUI
import WebKit
import SafariServices

private enum Bubblegum {
    static let canvas = UIColor(red: 1, green: 238/255, blue: 242/255, alpha: 1)
    static let ink = Color(red: 26/255, green: 26/255, blue: 26/255)
    static let pink = Color(red: 1, green: 45/255, blue: 141/255)
}

private let site = URL(string: "https://slayornay-nails.netlify.app/")!

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
    @State private var section = "vote"
    var body: some View {
        VStack(spacing: 0) {
            HStack {
                AsyncImage(url: URL(string: "https://slayornay-nails.netlify.app/logo.png")) { image in image.resizable().scaledToFit() } placeholder: { ProgressView() }.frame(width: 64, height: 64).accessibilityLabel("Gloss or Toss")
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
        let css = "header,footer{display:none!important}.vote-page .intro,.focus-controls{display:none!important}.vote-page main{padding-top:12px!important}.vote-page #vote-card{height:calc(100dvh - 110px)!important;min-height:360px!important}"
        let script = "const style=document.createElement('style');style.textContent=" + String(data: try! JSONEncoder().encode(css), encoding: .utf8)! + ";document.head.appendChild(style);"
        model.webView.configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        model.open("vote")
        return model.webView
    }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let model: BrowserModel
        init(_ model: BrowserModel) { self.model = model }
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
