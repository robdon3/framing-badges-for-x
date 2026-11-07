const MAX_FRAME = 1024 * 1024;

/** 4-byte little-endian length + UTF-8 JSON. Same bytes the Swift host reads and writes. */
export function encodeNativeFrame(payload) {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  if (json.byteLength > MAX_FRAME) throw new Error('Native message is too large.');
  const frame = new Uint8Array(4 + json.byteLength);
  new DataView(frame.buffer).setUint32(0, json.byteLength, true);
  frame.set(json, 4);
  return frame;
}

export function decodeNativeFrames(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const messages = [];
  let offset = 0;
  while (offset + 4 <= bytes.byteLength) {
    const length = new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
    if (length > MAX_FRAME) throw new Error('Native message is too large.');
    if (offset + 4 + length > bytes.byteLength) break;
    const slice = bytes.subarray(offset + 4, offset + 4 + length);
    messages.push(JSON.parse(new TextDecoder().decode(slice)));
    offset += 4 + length;
  }
  return { messages, rest: bytes.subarray(offset) };
}
