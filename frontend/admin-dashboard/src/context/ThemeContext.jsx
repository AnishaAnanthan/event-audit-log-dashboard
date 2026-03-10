import { createContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {},
});

function applyThemeClasses(theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("theme-light", theme === "light");
  root.classList.add("theme-transition");
}

function ThemeProvider({ children }) {
  // Theme toggle removed: lock admin dashboard to dark theme.
  const [theme] = useState("dark");

  useEffect(() => {
    applyThemeClasses(theme);
  }, [theme]);

  const toggleTheme = () => {};

  const value = useMemo(() => ({ theme, toggleTheme }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export { ThemeContext, ThemeProvider };
