import Typography from "typography";
import theme from "typography-theme-lincoln";

const hasDefault = <T extends object>(
    mod: T | { default: T }
): mod is { default: T } => "default" in mod && Boolean(mod.default);

const unwrap = <T extends object>(mod: T | { default: T }): T =>
    hasDefault(mod) ? mod.default : mod;

const typography = new (unwrap(Typography))(unwrap(theme));

export default typography;
export const rhythm = typography.rhythm;
