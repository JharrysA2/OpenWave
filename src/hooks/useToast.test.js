import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useToast } from "./useToast";

describe("useToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with an empty list of toasts", () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toasts).toEqual([]);
  });

  it("should add a toast with default type 'info'", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.show("Hello world");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0]).toMatchObject({
      msg: "Hello world",
      type: "info",
    });
    expect(result.current.toasts[0]).toHaveProperty("id");
  });

  it("should add a toast with the specified type", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.show("Error!", "error");
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].type).toBe("error");
  });

  it("should add a success toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.show("Operación exitosa", "success");
    });

    expect(result.current.toasts[0].type).toBe("success");
  });

  it("should add multiple toasts", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.show("First", "info");
      result.current.show("Second", "error");
      result.current.show("Third", "success");
    });

    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts[0].msg).toBe("First");
    expect(result.current.toasts[1].msg).toBe("Second");
    expect(result.current.toasts[2].msg).toBe("Third");
  });

  it("should auto-remove toasts after 3 seconds", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.show("Auto dismiss");
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it("should auto-remove only the expired toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.show("First", "info");
    });

    const firstId = result.current.toasts[0].id;

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      result.current.show("Second", "info");
    });

    expect(result.current.toasts).toHaveLength(2);

    // Advance 2 more seconds (3 total since First was added)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // First should be gone, Second should remain
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].id).not.toBe(firstId);
    expect(result.current.toasts[0].msg).toBe("Second");
  });

  it("should use unique IDs for each toast", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.show("A");
      result.current.show("B");
      result.current.show("C");
    });

    const ids = result.current.toasts.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(3);
  });

  it("should preserve toast order (FIFO)", () => {
    const { result } = renderHook(() => useToast());

    act(() => {
      result.current.show("First toast");
      result.current.show("Second toast");
    });

    expect(result.current.toasts[0].msg).toBe("First toast");
    expect(result.current.toasts[1].msg).toBe("Second toast");
  });
});
