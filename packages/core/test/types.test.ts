import { describe, expect, it } from "vitest";
import { JOB_STATUSES, JOB_STATUS_TRANSITIONS, canTransition } from "../src/types/index.js";

describe("状態遷移(§12)", () => {
  it("基本フローを許可する", () => {
    expect(canTransition("queued", "preparing")).toBe(true);
    expect(canTransition("preparing", "starting")).toBe(true);
    expect(canTransition("starting", "running")).toBe(true);
    expect(canTransition("running", "waiting_permission")).toBe(true);
    expect(canTransition("waiting_permission", "running")).toBe(true);
    expect(canTransition("running", "completed")).toBe(true);
    expect(canTransition("cancel_requested", "cancelled")).toBe(true);
  });

  it("不正な遷移を拒否する", () => {
    expect(canTransition("completed", "running")).toBe(false);
    expect(canTransition("cancelled", "running")).toBe(false);
    expect(canTransition("queued", "running")).toBe(false);
    expect(canTransition("failed", "queued")).toBe(false);
  });

  it("全ステータスが遷移マップに定義されている", () => {
    for (const s of JOB_STATUSES) {
      expect(JOB_STATUS_TRANSITIONS[s]).toBeDefined();
    }
  });

  it("終端状態からは遷移できない", () => {
    for (const terminal of ["completed", "failed", "cancelled", "expired"] as const) {
      expect(JOB_STATUS_TRANSITIONS[terminal]).toHaveLength(0);
    }
  });
});
