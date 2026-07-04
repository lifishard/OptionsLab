import { useEffect } from "react";

// OptionsLab is a dark-only quant desk. ThemeProvider fixes `dark` on <html>.
// Light-mode switching arrives in a later phase.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dark");
    root.classList.remove("light");
    root.style.colorScheme = "dark";
  }, []);
  return <>{children}</>;
}
