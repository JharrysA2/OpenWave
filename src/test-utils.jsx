import React from "react";
import { render } from "@testing-library/react";
import { SettingsProvider } from "./contexts/SettingsContext";

/**
 * Render a component wrapped in the app's SettingsProvider.
 * Provides `settings`, `updateSetting`, and `t` (translations)
 * so that components using the useSettings hook work in tests.
 */
export function renderWithSettings(component) {
  return render(<SettingsProvider>{component}</SettingsProvider>);
}

/**
 * Create a mock fetch Response-like object.
 * The api.js _fetch function checks resp.ok and resp.headers.get("content-type"),
 * so bare { json: () => ... } mocks will fail.
 */
export function mockApiResponse(data, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: () => "application/json",
    },
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}
