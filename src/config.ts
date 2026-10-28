import { readFileSync } from "node:fs";

export const config = JSON.parse(readFileSync("config/sources.json", "utf8"));
