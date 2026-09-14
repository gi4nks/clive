import { describe, it, expect, vi } from "vitest"
import { createPlanFromMessage, sanitizePlannerText } from "./createPlanFromMessage"
import { getDebugLogs, clearDebugLogs } from "./usePlanDebug"
import type { FileEntry } from "../api"

describe("createPlanFromMessage debug logging integration", () => {
  const dummyEntries: FileEntry[] = [
    { name: "test.pdf", path: "/test/test.pdf", isDir: false, size: 100, modified: 1000, extension: "pdf" },
  ]

  it("removes terminal color control sequences from planner text", () => {
    expect(sanitizePlannerText("ok\u001b]4;108;rgb:8787/afaf/8787\\\u001b\\fine\u001b[31m!\u001b[0m")).toBe("okfine!")
  })

  it("logs pending then success status when plan is generated", async () => {
    clearDebugLogs()
    const mockGenerate = vi.fn().mockResolvedValue({
      folders: ["Docs"],
      rules: [{ match: "pdf", to: "Docs" }],
      renames: [],
      trashPatterns: [],
    })

    const plan = await createPlanFromMessage({
      text: "organize pdfs",
      entries: dummyEntries,
      currentPath: "/test",
      guardOn: false,
      model: "test-model",
      health: { ok: true, providers: {} },
      generate: mockGenerate,
      streamGenerate: vi.fn().mockRejectedValue(new Error('not used in this test')),
    })

    expect(plan.ops.length).toBeGreaterThan(0)
    const logs = getDebugLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].status).toBe("success")
    expect(logs[0].model).toBe("test-model")
    expect(logs[0].expandedOpsCount).toBe(plan.ops.length)
  })

  it("logs error status when provider is unreachable", async () => {
    clearDebugLogs()
    await expect(
      createPlanFromMessage({
        text: "organize pdfs",
        entries: dummyEntries,
        currentPath: "/test",
        guardOn: false,
        model: "test-model",
        health: { ok: false, providers: {} },
      })
    ).rejects.toThrow()

    const logs = getDebugLogs()
    expect(logs.length).toBe(1)
    expect(logs[0].status).toBe("error")
  })

  it("uses the streaming turn first, without waiting for structured output", async () => {
    clearDebugLogs()
    const streamGenerate = vi.fn().mockResolvedValue({
      folders: ["Docs"],
      rules: [{ match: "pdf", to: "Docs" }],
      renames: [],
      trashPatterns: [],
      fallback: "Docs",
    })
    const plan = await createPlanFromMessage({
      text: "organize pdfs",
      entries: dummyEntries,
      currentPath: "/test",
      guardOn: false,
      model: "test-model",
      health: { ok: true, providers: {} },
      generate: vi.fn().mockRejectedValue(new Error('structured path must not run')),
      streamGenerate,
    })

    expect(streamGenerate).toHaveBeenCalledTimes(1)
    expect(plan.ops.length).toBeGreaterThan(0)
    const logs = getDebugLogs()
    expect(logs[0].status).toBe("success")
  })

  it("falls back to structured output when streaming generation fails", async () => {
    clearDebugLogs()
    const streamGenerate = vi.fn().mockRejectedValue(new Error("stream unavailable"))
    const generate = vi.fn().mockResolvedValue({
      folders: ["Docs"], rules: [{ match: "pdf", to: "Docs" }], renames: [], trashPatterns: [],
    })
    const plan = await createPlanFromMessage({
      text: "organize pdfs",
      entries: dummyEntries,
      currentPath: "/test",
      guardOn: false,
      model: "test-model",
      health: { ok: true, providers: {} },
      generate,
      streamGenerate,
    })

    expect(streamGenerate).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(plan.ops.length).toBeGreaterThan(0)
  })

  it("does NOT fall back when the user aborts the streaming call", async () => {
    clearDebugLogs()
    const ac = new AbortController()
    ac.abort()
    const streamGenerate = vi.fn()
    await expect(
      createPlanFromMessage({
        text: "organize pdfs",
        entries: dummyEntries,
        currentPath: "/test",
        guardOn: false,
        model: "test-model",
        health: { ok: true, providers: {} },
        signal: ac.signal,
        generate: vi.fn(),
        streamGenerate,
      })
    ).rejects.toThrow()
    expect(streamGenerate).not.toHaveBeenCalled()
  })

  it("surfaces the structured failure after the streaming failure", async () => {
    clearDebugLogs()
    await expect(
      createPlanFromMessage({
        text: "organize pdfs",
        entries: dummyEntries,
        currentPath: "/test",
        guardOn: false,
        model: "test-model",
        health: { ok: true, providers: {} },
        generate: vi.fn().mockRejectedValue(new Error("structured dead")),
        streamGenerate: vi.fn().mockRejectedValue(new Error("stream dead too")),
      })
    ).rejects.toThrow("structured dead")
  })
})
