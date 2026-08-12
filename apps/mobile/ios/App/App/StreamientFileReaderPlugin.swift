import Capacitor
import Foundation

@objc(StreamientFileReaderPlugin)
public class StreamientFileReaderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StreamientFileReaderPlugin"
    public let jsName = "StreamientFileReader"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "stat", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "readChunk", returnType: CAPPluginReturnPromise)]
    private let maximumChunkBytes = 20_000_000

    @objc func stat(_ call: CAPPluginCall) {
        do {
            let url = try fileURL(call.getString("uri") ?? "")
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            guard let size = attributes[.size] as? NSNumber else {
                call.reject("The shared file size is unavailable")
                return
            }
            call.resolve(["size": size.int64Value])
        } catch {
            call.reject("Unable to inspect the shared file", nil, error)
        }
    }

    @objc func readChunk(_ call: CAPPluginCall) {
        let offset = call.getInt("offset") ?? 0
        let length = call.getInt("length") ?? 0
        guard offset >= 0, length > 0, length <= maximumChunkBytes else {
            call.reject("Invalid chunk range")
            return
        }
        do {
            let url = try fileURL(call.getString("uri") ?? "")
            let granted = url.startAccessingSecurityScopedResource()
            defer { if granted { url.stopAccessingSecurityScopedResource() } }
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            try handle.seek(toOffset: UInt64(offset))
            let data = try handle.read(upToCount: length) ?? Data()
            call.resolve(["data": data.base64EncodedString(), "bytesRead": data.count])
        } catch {
            call.reject("Unable to read the shared file", nil, error)
        }
    }

    private func fileURL(_ value: String) throws -> URL {
        if let url = URL(string: value), url.isFileURL { return url }
        guard value.hasPrefix("/") else { throw NSError(domain: "StreamientFileReader", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unsupported shared URI"]) }
        return URL(fileURLWithPath: value)
    }
}
