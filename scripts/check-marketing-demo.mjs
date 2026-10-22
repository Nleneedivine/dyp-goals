import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const main = readFileSync("src/main.tsx", "utf8");
const demo = readFileSync("src/pages/MarketingDemoStudio.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");

assert.match(main, /VITE_ENABLE_MARKETING_DEMO\s*===\s*"true"/, "Demo flag must require explicit true");
assert.match(main, /import\("\.\/pages\/MarketingDemoStudio\.tsx"\)/, "Demo must be dynamically imported");
assert.match(main, /import\("\.\/App\.tsx"\)/, "Production app must have independent import");
assert.doesNotMatch(app, /MarketingDemoStudio|marketing-demo/, "Production App must not import or route to demo");
assert.doesNotMatch(demo, /@\/integrations\/supabase|@supabase|supabase\.|lovable\.auth|fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|\.rpc\s*\(|functions\.invoke/, "Demo must not access production services");
assert.match(demo, /FICTIONAL DEMO/, "Recorded demo must be labeled");
assert.match(demo, /Illustrative preview/, "AI simulation must be identified as illustrative");
console.log("PASS: marketing demo static isolation invariants");
