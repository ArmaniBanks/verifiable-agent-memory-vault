import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        cloud: "#f6f7f2",
        moss: "#5b7052",
        copper: "#b85c38",
        tide: "#226f7a"
      }
    }
  },
  plugins: []
};

export default config;

