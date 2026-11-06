import { createTheme, type Theme } from "@mui/material";

export type RoleColors = {
    user: string;
    assistant: string;
    other: string;
};

declare module "@mui/material/styles" {
    interface Palette {
        roleColors: RoleColors;
    }
    interface PaletteOptions {
        roleColors?: RoleColors;
    }
}

/** The colors of the page behind the application, which come from the variables in index.css. */
export type DocumentColors = {
    background: string;
    text: string;
    heading: string;
    border: string;
    scrollbarThumb: string;
};

export type ThemeDefinition = {
    id: string;
    name: string;
    theme: Theme;
    /** Without these, the page uses the colors from index.css. */
    document?: DocumentColors;
};

type ThemeColors = {
    mode: "light" | "dark";
    background: string;
    paper: string;
    text: string;
    secondaryText: string;
    divider: string;
    scrollbarThumb: string;
    primary: string;
    info: string;
    success: string;
    warning: string;
    error: string;
    roleColors: RoleColors;
};

export const LIGHT_THEME_ID = "light";
export const DARK_THEME_ID = "dark";

export const THEME_STORAGE_KEY = "themeId";
/** Where the choice between light and dark used to be saved. */
export const OLD_THEME_MODE_STORAGE_KEY = "themeMode";

// A deep teal that still gives white text 4.5:1 and stays visible against the dark cards.
const DARK_ACCENT_COLOR = "#0d62b8";

const ROLE_COLORS: RoleColors = {
    user: "rgb(163,211,156)",
    assistant: "rgb(109,207,246)",
    other: "rgb(249,173,129)",
};

/**
 * @param id The id the choice is saved with
 * @param name The name shown in the settings
 * @param colors The colors of the theme. Some differ a little from the original palettes, so that all text stays readable.
 */
function colorTheme(id: string, name: string, colors: ThemeColors): ThemeDefinition {
    return {
        id: id,
        name: name,
        theme: createTheme({
            palette: {
                mode: colors.mode,
                contrastThreshold: 4.5,
                primary: { main: colors.primary },
                info: { main: colors.info },
                success: { main: colors.success },
                warning: { main: colors.warning },
                error: { main: colors.error },
                background: { default: colors.background, paper: colors.paper },
                text: { primary: colors.text, secondary: colors.secondaryText },
                divider: colors.divider,
                roleColors: colors.roleColors,
            },
        }),
        document: {
            background: colors.background,
            text: colors.secondaryText,
            heading: colors.text,
            border: colors.divider,
            scrollbarThumb: colors.scrollbarThumb,
        },
    };
}

export const THEMES: ThemeDefinition[] = [
    {
        id: LIGHT_THEME_ID,
        name: "Light",
        theme: createTheme({
            palette: {
                mode: "light",
                roleColors: ROLE_COLORS,
            },
        }),
    },
    {
        id: DARK_THEME_ID,
        name: "Dark",
        theme: createTheme({
            palette: {
                mode: "dark",
                primary: {
                    main: DARK_ACCENT_COLOR,
                },
                info: {
                    main: DARK_ACCENT_COLOR,
                },
                background: {
                    default: "#16171d",
                    paper: "#1f2028",
                },
                roleColors: ROLE_COLORS,
            },
        }),
    },
    colorTheme("solarized-light", "Solarized Light", {
        mode: "light",
        background: "#eee8d5",
        paper: "#fdf6e3",
        text: "#073642",
        secondaryText: "#4e6068",
        divider: "#d3cbb7",
        scrollbarThumb: "#93a1a1",
        primary: "#1c6ca8",
        info: "#1c6ca8",
        success: "#5a6800",
        warning: "#856300",
        error: "#c02b28",
        roleColors: { user: "#5a6800", assistant: "#1c6ca8", other: "#a83e12" },
    }),
    colorTheme("solarized-dark", "Solarized Dark", {
        mode: "dark",
        background: "#002b36",
        paper: "#073642",
        text: "#eee8d5",
        secondaryText: "#a9b6b6",
        divider: "#2a4f58",
        scrollbarThumb: "#586e75",
        primary: "#55a9e6",
        info: "#55a9e6",
        success: "#a4bb00",
        warning: "#d5a400",
        error: "#f2706e",
        roleColors: { user: "#a4bb00", assistant: "#55a9e6", other: "#ee8a56" },
    }),
    colorTheme("nord", "Nord", {
        mode: "dark",
        background: "#2e3440",
        paper: "#3b4252",
        text: "#eceff4",
        secondaryText: "#d8dee9",
        divider: "#4c566a",
        scrollbarThumb: "#4c566a",
        primary: "#88c0d0",
        info: "#88c0d0",
        success: "#a3be8c",
        warning: "#ebcb8b",
        error: "#e39aa1",
        roleColors: { user: "#a3be8c", assistant: "#88c0d0", other: "#e5a58a" },
    }),
    colorTheme("dracula", "Dracula", {
        mode: "dark",
        background: "#282a36",
        paper: "#343746",
        text: "#f8f8f2",
        secondaryText: "#c4c8dc",
        divider: "#44475a",
        scrollbarThumb: "#6272a4",
        primary: "#bd93f9",
        info: "#8be9fd",
        success: "#50fa7b",
        warning: "#f1fa8c",
        error: "#ff8080",
        roleColors: { user: "#50fa7b", assistant: "#8be9fd", other: "#ffb86c" },
    }),
    colorTheme("gruvbox-dark", "Gruvbox Dark", {
        mode: "dark",
        background: "#282828",
        paper: "#3c3836",
        text: "#ebdbb2",
        secondaryText: "#d5c4a1",
        divider: "#504945",
        scrollbarThumb: "#665c54",
        primary: "#8ec07c",
        info: "#8ec07c",
        success: "#b8bb26",
        warning: "#fabd2f",
        error: "#fb7a68",
        roleColors: { user: "#b8bb26", assistant: "#8ec07c", other: "#fe8019" },
    }),
];

/**
 * @returns The theme with this id, or undefined if it doesn't exist
 */
export function findTheme(id: unknown): ThemeDefinition | undefined {
    return THEMES.find((theme) => theme.id === id);
}
