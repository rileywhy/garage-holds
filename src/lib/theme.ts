export const THEME_STORAGE_KEY = "crux-theme";

// Runs before paint; absent/invalid preferences leave CSS following the system.
// This constant contains no user-supplied content.
export const THEME_INITIALIZATION_SCRIPT = `try{var theme=localStorage.getItem("${THEME_STORAGE_KEY}");if(theme==="light"||theme==="dark")document.documentElement.dataset.theme=theme}catch{}`;
