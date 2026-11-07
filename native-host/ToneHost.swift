import Foundation
import FoundationModels

// Chrome native messaging host for Framing Badges.
// stdin/stdout frames are 4-byte little-endian lengths plus UTF-8 JSON.
// stdout is the protocol only. Post text is never written to disk or logged.
//
// Build from this directory (command-line tools, no Xcode app). @main needs -parse-as-library.
//   xcrun --sdk macosx swiftc -parse-as-library -O -o tone-host ToneHost.swift

private let textLimit = 1000
private let toneLabels = ["whining", "fun", "sad", "angry", "hype", "sarcastic", "informative", "neutral"]
private let toneInstructions = "Classify the tone of an X post. Reply with exactly one word from: whining, fun, sad, angry, hype, sarcastic, informative, neutral."

private func exactLabel(_ raw: String) -> String? {
    let cleaned = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    return toneLabels.contains(cleaned) ? cleaned : nil
}

private func mapLabel(_ raw: String) -> String {
    exactLabel(raw) ?? "neutral"
}

private struct Incoming: Sendable {
    var id: String
    var text: String
}

@main
struct ToneHost {
    static func main() async {
        // Read the next frame only after the previous reply is written, so this
        // blocked read never overlaps an in-flight model call.
        while let incoming = readIncoming() {
            let reply = await classify(incoming)
            do {
                try writeJSON(reply)
            } catch {
                // A failed write must not end the process. fsync on Chrome's pipe throws,
                // and one bad reply should not drop the rest of the session.
                reportWriteFailure()
            }
        }
    }
}

private struct HostReply: Encodable, Sendable {
    var id: String
    var label: String? = nil
    var ms: Int? = nil
    var error: String? = nil

    private enum CodingKeys: String, CodingKey {
        case id, label, ms, error
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id)
        if let error {
            try container.encode(error, forKey: .error)
            return
        }
        if let label {
            try container.encode(label, forKey: .label)
            try container.encode(ms ?? 0, forKey: .ms)
        }
    }
}

private func classify(_ incoming: Incoming) async -> HostReply {
    let clipped = truncate(incoming.text)
    if clipped.isEmpty {
        return HostReply(id: incoming.id, error: "Post text is empty.")
    }
    if let message = unavailableMessage(SystemLanguageModel.default.availability) {
        return HostReply(id: incoming.id, error: message)
    }
    let started = Date()
    let label = await chooseLabel(clipped)
    let ms = max(0, Int(Date().timeIntervalSince(started) * 1000.0))
    return HostReply(id: incoming.id, label: label, ms: ms)
}

private func chooseLabel(_ text: String) async -> String {
    if let guided = await guidedRaw(text), let label = exactLabel(guided) {
        return label
    }
    // Plain string generation already works with command-line tools. Map it, or neutral.
    if let plain = await plainRaw(text) {
        return mapLabel(plain)
    }
    return "neutral"
}

private func guidedRaw(_ text: String) async -> String? {
    do {
        let dynamic = DynamicGenerationSchema(name: "ToneLabel", anyOf: toneLabels)
        let schema = try GenerationSchema(root: dynamic, dependencies: [])
        // A new session per post, so the transcript does not grow.
        let session = LanguageModelSession(instructions: toneInstructions)
        let response = try await session.respond(to: text, schema: schema)
        return try response.content.value(String.self)
    } catch {
        return nil
    }
}

private func plainRaw(_ text: String) async -> String? {
    do {
        let session = LanguageModelSession(instructions: toneInstructions)
        let response = try await session.respond(to: text)
        return response.content
    } catch {
        return nil
    }
}

private func unavailableMessage(_ availability: SystemLanguageModel.Availability) -> String? {
    switch availability {
    case .available:
        return nil
    case .unavailable(let reason):
        switch reason {
        case .deviceNotEligible:
            return "Apple on-device model is unavailable: this Mac is not eligible."
        case .appleIntelligenceNotEnabled:
            return "Apple on-device model is unavailable: Apple Intelligence is turned off."
        case .modelNotReady:
            return "Apple on-device model is unavailable: the model is not ready yet."
        @unknown default:
            return "Apple on-device model is unavailable."
        }
    }
}

private func truncate(_ text: String) -> String {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    if trimmed.count <= textLimit { return trimmed }
    return String(trimmed.prefix(textLimit))
}

private func readIncoming() -> Incoming? {
    let stdin = FileHandle.standardInput
    guard let header = readExact(stdin, 4) else { return nil }
    let length = header.withUnsafeBytes { raw in
        UInt32(littleEndian: raw.load(as: UInt32.self))
    }
    // Chrome's native messaging limit is 1 MiB. A larger header means the stream is lost.
    if length == 0 || length > 1_048_576 { return nil }
    guard let body = readExact(stdin, Int(length)) else { return nil }
    return parseIncoming(body)
}

private func parseIncoming(_ body: Data) -> Incoming {
    guard
        let object = try? JSONSerialization.jsonObject(with: body) as? [String: Any]
    else {
        return Incoming(id: "", text: "")
    }
    return Incoming(id: jsonID(object["id"]), text: object["text"] as? String ?? "")
}

private func jsonID(_ value: Any?) -> String {
    switch value {
    case let text as String:
        return text
    case let number as NSNumber:
        return number.stringValue
    default:
        return ""
    }
}

private func readExact(_ handle: FileHandle, _ count: Int) -> Data? {
    var data = Data()
    data.reserveCapacity(count)
    while data.count < count {
        let needed = count - data.count
        guard let chunk = try? handle.read(upToCount: needed) else { return nil }
        if chunk.isEmpty { return nil }
        data.append(chunk)
    }
    return data
}

private func writeJSON(_ reply: HostReply) throws {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let json = try encoder.encode(reply)
    var length = UInt32(json.count).littleEndian
    let header = withUnsafeBytes(of: &length) { Data($0) }
    var frame = Data()
    frame.reserveCapacity(header.count + json.count)
    frame.append(header)
    frame.append(json)
    try FileHandle.standardOutput.write(contentsOf: frame)
}

private func reportWriteFailure() {
    let message = Data("tone-host: could not write a reply\n".utf8)
    try? FileHandle.standardError.write(contentsOf: message)
}
