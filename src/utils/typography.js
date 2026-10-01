import Typography from "typography";
import theme from "typography-theme-lincoln";

// Both packages are CommonJS builds that put their export on `.default`,
// depending on the loader the module comes through the namespace or the
// export itself, so accept both.
const unwrap = (mod) => (mod && mod.default) || mod;

const typography = new (unwrap(Typography))(unwrap(theme));

export default typography;
export const rhythm = typography.rhythm;
