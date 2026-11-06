import {
    DARK_THEME_ID,
    findTheme,
    LIGHT_THEME_ID,
    OLD_THEME_MODE_STORAGE_KEY,
    THEME_STORAGE_KEY,
    THEMES,
    type ThemeDefinition,
} from "../constants/theme.constants";
import { type Service } from "../interfaces/service.interface";
import { Reactive } from "./reactive.service";
import type { StorageService } from "./storage.service";

export class ThemeService implements Service {

    private _storageService: StorageService;

    private _theme: Reactive<ThemeDefinition>;

    constructor(storageService: StorageService) {
        this._storageService = storageService;
        // Loaded here rather than in init() so that the first render already uses the right theme.
        this._theme = new Reactive<ThemeDefinition>(this.loadTheme());
        this.applyToDocument();
    }

    init() {

    }

    exit() {

    }

    /**
     * The theme that is currently used.
     */
    get theme(): Reactive<ThemeDefinition> {
        return this._theme;
    }

    /**
     * The themes that can be chosen.
     */
    get themes(): ThemeDefinition[] {
        return THEMES;
    }

    /**
     * Changes the theme of the application and saves the choice in this browser.
     * @param id The id of the theme to use
     */
    setTheme(id: string): void {
        const theme = findTheme(id);
        if (theme !== undefined) {
            this._storageService.setLocally(THEME_STORAGE_KEY, theme.id);
            this._theme.set(theme);
            this.applyToDocument();
        }
    }

    private loadTheme(): ThemeDefinition {
        const saved = findTheme(this._storageService.getLocally<unknown>(THEME_STORAGE_KEY));
        if (saved !== undefined) {
            return saved;
        }

        const oldChoice = findTheme(this._storageService.getLocally<unknown>(OLD_THEME_MODE_STORAGE_KEY));
        this._storageService.removeLocally(OLD_THEME_MODE_STORAGE_KEY);
        if (oldChoice !== undefined) {
            this._storageService.setLocally(THEME_STORAGE_KEY, oldChoice.id);
            return oldChoice;
        }

        const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? DARK_THEME_ID : LIGHT_THEME_ID;
        return findTheme(systemTheme) as ThemeDefinition;
    }

    /**
     * The page behind the application gets its colors from index.css, which themes can override.
     */
    private applyToDocument(): void {
        const root = document.documentElement;
        const { theme, document: colors } = this._theme.value;

        root.dataset.theme = theme.palette.mode;

        const setOrRemove = (property: string, value: string | undefined) => {
            if (value === undefined) {
                root.style.removeProperty(property);
            } else {
                root.style.setProperty(property, value);
            }
        };
        setOrRemove("--bg", colors?.background);
        setOrRemove("--code-bg", colors?.background);
        setOrRemove("--text", colors?.text);
        setOrRemove("--text-h", colors?.heading);
        setOrRemove("--border", colors?.border);
        setOrRemove("scrollbar-color", colors === undefined ? undefined : `${colors.scrollbarThumb} ${colors.background}`);
        if (root.getAttribute("style") === "") {
            root.removeAttribute("style");
        }
    }
}
