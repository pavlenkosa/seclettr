// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

import { AppearanceSettingsSection } from "../AppearanceSettingsSection";

describe("AppearanceSettingsSection", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
    delete (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("routes appearance interactions to the matching setters", () => {
    const setLocale = vi.fn();
    const setThemeMode = vi.fn();
    const setAccentColor = vi.fn();

    act(() => {
      root.render(
        <AppearanceSettingsSection
          locale="en"
          setLocale={setLocale}
          themeMode="dark"
          accentColor="blue"
          fontSize="md"
          customThemeBg="#0b1526"
          customThemeAccent="#3b82f6"
          setThemeMode={setThemeMode}
          setAccentColor={setAccentColor}
          setFontSize={vi.fn()}
          setCustomThemeBg={vi.fn()}
          setCustomThemeAccent={vi.fn()}
        />
      );
    });

    const russianButton = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="settings.language"] button:nth-of-type(2)'
    );
    const lightThemeButton = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "settings.theme.light"
    );
    const emeraldSwatch = document.body.querySelector<HTMLButtonElement>(
      '[aria-label="settings.colors.emerald"]'
    );

    expect(russianButton).not.toBeNull();
    expect(lightThemeButton).not.toBeUndefined();
    expect(emeraldSwatch).not.toBeNull();

    act(() => {
      russianButton?.click();
      lightThemeButton?.click();
      emeraldSwatch?.click();
    });

    expect(setLocale).toHaveBeenCalledWith("ru");
    expect(setThemeMode).toHaveBeenCalledWith("light");
    expect(setAccentColor).toHaveBeenCalledWith("emerald");
  });
});
