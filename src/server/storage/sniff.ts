/**
 * What the first bytes of an uploaded file say it is. The declared MIME type and the file extension are chosen by the uploader,
 * so they can't be trusted on their own: this catches programs and web pages dressed up as media or documents.
 */
export type ContentKind = "executable" | "script" | "markup" | "other";

export function sniffContent(head: Buffer): ContentKind {
  if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) return "executable"; // "MZ" — Windows PE / DOS
  if (head.length >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return "executable"; // ELF
  if (head.length >= 4) {
    const magic = head.readUInt32BE(0);
    // Mach-O (32/64-bit, either byte order) and fat binaries / Java class files (0xCAFEBABE) — none of these is ever media or a document
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(magic)) return "executable";
  }
  if (head.length >= 2 && head[0] === 0x23 && head[1] === 0x21) return "script"; // "#!" shebang
  const text = head.subarray(0, 512).toString("utf8").replace(/^﻿/, "").trimStart().toLowerCase();
  if (/^(<!doctype\s+html|<html|<head|<body|<script|<iframe|<\?php)/.test(text)) return "markup";
  return "other";
}

const PLAIN_TEXT_NAME = /\.(txt|csv|json|srt|vtt|ass|lut|cube|md)$/i;

/** Returns why a file must be refused, or null when its contents are consistent with what it claims to be. */
export function contentProblem(kind: ContentKind, mime: string, filename: string): string | null {
  const text = mime.startsWith("text/") || mime === "application/json" || PLAIN_TEXT_NAME.test(filename);
  if (kind === "executable") return "It looks like a program, which isn't allowed for security reasons.";
  if (kind === "script" && !text) return "Its contents look like a script rather than the file type it claims to be.";
  if (kind === "markup" && !text) return "Its contents look like a web page rather than the file type it claims to be.";
  return null;
}
