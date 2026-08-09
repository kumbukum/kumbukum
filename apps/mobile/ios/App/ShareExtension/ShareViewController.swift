import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private let appGroupId = "group.com.streamient.mobile"
    private let sharedDataKey = "share-target-data"

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        Task { await receiveShare() }
    }

    private func receiveShare() async {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem else {
            finish()
            return
        }
        var texts: [String] = []
        var files: [[String: String]] = []
        for provider in item.attachments ?? [] {
            if files.isEmpty, let file = await copySharedFile(provider) {
                files.append(file)
                continue
            }
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier), let value = await loadValue(provider, type: UTType.url.identifier) {
                if let url = value as? URL { texts.append(url.absoluteString) }
                else if let text = value as? String { texts.append(text) }
                continue
            }
            if provider.hasItemConformingToTypeIdentifier(UTType.text.identifier), let value = await loadValue(provider, type: UTType.text.identifier) {
                if let text = value as? String { texts.append(text) }
            }
        }
        let payload: [String: Any] = ["title": item.attributedTitle?.string ?? "", "texts": texts, "files": files]
        let defaults = UserDefaults(suiteName: appGroupId)
        defaults?.set(payload, forKey: sharedDataKey)
        defaults?.synchronize()
        guard let url = URL(string: "com.streamient.mobile://share") else {
            finish()
            return
        }
        extensionContext?.open(url) { [weak self] _ in self?.finish() }
    }

    private func copySharedFile(_ provider: NSItemProvider) async -> [String: String]? {
        let contentType = provider.registeredTypeIdentifiers.compactMap { UTType($0) }.first { type in type.conforms(to: .content) && !type.conforms(to: .url) && (provider.suggestedName != nil || !type.conforms(to: .text)) }
        guard let contentType else { return nil }
        return await withCheckedContinuation { continuation in
            provider.loadFileRepresentation(forTypeIdentifier: contentType.identifier) { [weak self] source, _ in
                guard let self, let source, let group = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: self.appGroupId) else {
                    continuation.resume(returning: nil)
                    return
                }
                do {
                    let folder = group.appendingPathComponent("Incoming", isDirectory: true).appendingPathComponent(UUID().uuidString, isDirectory: true)
                    try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                    let name = source.lastPathComponent.isEmpty ? "Shared document" : source.lastPathComponent
                    let destination = folder.appendingPathComponent(name)
                    try FileManager.default.copyItem(at: source, to: destination)
                    continuation.resume(returning: ["uri": destination.absoluteString, "name": name, "mimeType": contentType.preferredMIMEType ?? "application/octet-stream"])
                } catch {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func loadValue(_ provider: NSItemProvider, type: String) async -> NSSecureCoding? {
        return await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { value, _ in continuation.resume(returning: value) }
        }
    }

    private func finish() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }
}
