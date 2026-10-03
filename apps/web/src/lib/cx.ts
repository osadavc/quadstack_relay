/* Join class names, skipping falsy parts. Plain module, usable on the server. */
export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}
