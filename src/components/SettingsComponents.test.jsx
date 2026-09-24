import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SettingsProvider } from "../contexts/SettingsContext";
import {
  SettingRow,
  SettingsSection,
  SettingsToggle,
  SettingsChevron,
  BarPreview,
  SegBtn,
} from "./SettingsComponents";

// ── SettingRow ─────────────────────────────────────────────────────────────

describe("SettingRow", () => {
  it("should render label and description", () => {
    render(<SettingRow label="Theme" desc="Dark mode" />);
    expect(screen.getByText("Theme")).toBeInTheDocument();
    expect(screen.getByText("Dark mode")).toBeInTheDocument();
  });

  it("should render without description", () => {
    render(<SettingRow label="Version" />);
    expect(screen.getByText("Version")).toBeInTheDocument();
  });

  it("should render icon", () => {
    render(<SettingRow label="Toggle" icon={<span data-testid="icon">🔔</span>} />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("should render right element", () => {
    render(<SettingRow label="Item" right={<span data-testid="right">➡️</span>} />);
    expect(screen.getByTestId("right")).toBeInTheDocument();
  });

  it("should call onClick when clicked", () => {
    const onClick = vi.fn();
    render(<SettingRow label="Click me" onClick={onClick} />);
    fireEvent.click(screen.getByText("Click me"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should have pointer cursor when onClick is provided", () => {
    render(<SettingRow label="Clickable" onClick={() => {}} />);
    const row = screen.getByText("Clickable").parentElement.parentElement;
    expect(row).toHaveStyle("cursor: pointer");
  });

  it("should have default cursor when no onClick", () => {
    render(<SettingRow label="Static" />);
    const row = screen.getByText("Static").parentElement.parentElement;
    expect(row).toHaveStyle("cursor: default");
  });

  it("should show border by default", () => {
    render(<SettingRow label="With border" />);
    const row = screen.getByText("With border").parentElement.parentElement;
    expect(row).toHaveStyle("border-bottom: 1px solid rgba(255,255,255,.05)");
  });

  it("should hide border when border=false", () => {
    render(<SettingRow label="No border" border={false} />);
    const row = screen.getByText("No border").parentElement.parentElement;
    expect(row).toHaveStyle("border-bottom: none");
  });
});

// ── SettingsSection ────────────────────────────────────────────────────────

describe("SettingsSection", () => {
  it("should render title", () => {
    render(<SettingsSection title="General">content</SettingsSection>);
    expect(screen.getByText("General")).toBeInTheDocument();
  });

  it("should render children", () => {
    render(
      <SettingsSection title="Test">
        <span data-testid="child">Hello</span>
      </SettingsSection>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

// ── SettingsToggle ─────────────────────────────────────────────────────────

describe("SettingsToggle", () => {
  it("should render in off state by default", () => {
    const { container } = render(<SettingsToggle value={false} onChange={() => {}} />);
    const toggle = container.firstChild;
    expect(toggle).toHaveStyle("background: rgba(255,255,255,.15)");
  });

  it("should render in on state with accent color", () => {
    const { container } = render(<SettingsToggle value onChange={() => {}} accent="#ff0000" />);
    const toggle = container.firstChild;
    expect(toggle).toHaveStyle("background: #ff0000");
  });

  it("should call onChange with opposite value when clicked", () => {
    const onChange = vi.fn();
    const { container } = render(<SettingsToggle value={false} onChange={onChange} />);
    fireEvent.click(container.firstChild);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("should call onChange with false when currently on", () => {
    const onChange = vi.fn();
    const { container } = render(<SettingsToggle value onChange={onChange} />);
    fireEvent.click(container.firstChild);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

// ── SettingsChevron ────────────────────────────────────────────────────────

describe("SettingsChevron", () => {
  it("should render SVG chevron", () => {
    const { container } = render(<SettingsChevron />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute("width", "14");
    expect(svg).toHaveAttribute("height", "14");
  });
});

// ── SegBtn ────────────────────────────────────────────────────────────────────

describe("SegBtn", () => {
  it("should render all options", () => {
    render(
      <SettingsProvider>
        <SegBtn
          options={[
            ["es", "Español"],
            ["en", "English"],
          ]}
          settingKey="language"
          current="es"
        />
      </SettingsProvider>,
    );
    expect(screen.getByText("Español")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("should highlight the current option", () => {
    render(
      <SettingsProvider>
        <SegBtn
          options={[
            ["es", "Español"],
            ["en", "English"],
          ]}
          settingKey="language"
          current="es"
        />
      </SettingsProvider>,
    );
    const esBtn = screen.getByText("Español");
    expect(esBtn).toHaveStyle("background: rgba(255,255,255,.15)");
    expect(screen.getByText("English")).toHaveStyle("background: transparent");
  });

  it("should not throw when an option is clicked", () => {
    render(
      <SettingsProvider>
        <SegBtn
          options={[
            ["es", "Español"],
            ["en", "English"],
          ]}
          settingKey="language"
          current="es"
        />
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByText("English"));
    // After clicking, the language setting should have changed
    // Re-render would show English highlighted, but since SegBtn
    // reads from context, we verify it fires without error
    expect(screen.getByText("English")).toBeInTheDocument();
  });

  it("should handle multiple options correctly", () => {
    render(
      <SettingsProvider>
        <SegBtn
          options={[
            ["a", "A"],
            ["b", "B"],
            ["c", "C"],
          ]}
          settingKey="defaultTab"
          current="b"
        />
      </SettingsProvider>,
    );
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();

    const btns = screen.getAllByRole("button");
    expect(btns).toHaveLength(3);
  });
});

// ── BarPreview ─────────────────────────────────────────────────────────────

describe("BarPreview", () => {
  it("should render with default line style", () => {
    const { container } = render(<BarPreview style="line" accent="#a78bfa" />);
    const bar = container.firstChild.firstChild;
    expect(bar).toHaveStyle("height: 4px");
    expect(bar).toHaveStyle("background: #a78bfa");
  });

  it("should render thin bar", () => {
    const { container } = render(<BarPreview style="thin" accent="#fff" />);
    const bar = container.firstChild.firstChild;
    expect(bar).toHaveStyle("height: 2px");
  });

  it("should render thick bar", () => {
    const { container } = render(<BarPreview style="thick" accent="#000" />);
    const bar = container.firstChild.firstChild;
    expect(bar).toHaveStyle("height: 8px");
  });

  it("la fila clicable usa el hover glass suave (btnHoverSoft, no el plano)", () => {
    const { container } = render(<SettingRow label="Etiqueta" onClick={() => {}} />);
    const row = container.firstChild;
    const baseBg = row.style.background;
    fireEvent.mouseEnter(row);
    expect(row.style.background).toContain("linear-gradient");
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe(baseBg);
  });
});
