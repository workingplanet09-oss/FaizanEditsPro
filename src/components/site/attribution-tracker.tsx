"use client";

import { useEffect } from "react";
import { rememberAttribution } from "@/lib/attribution";

export function AttributionTracker() {
  useEffect(() => rememberAttribution(), []);
  return null;
}
