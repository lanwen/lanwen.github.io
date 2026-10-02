import Typography from "typography";
import theme from "typography-theme-lincoln";

const unwrap = (mod) => (mod && mod.default) || mod;

const typography = new (unwrap(Typography))(unwrap(theme));

export default typography;
export const rhythm = typography.rhythm;
