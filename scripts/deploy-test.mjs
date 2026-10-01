// Builds the site with card payments switched on and deploys it to the Flutterwave test address:
//   https://flutterwave-test.fidelstine.pages.dev
// That address is a Cloudflare "preview" deployment, so it uses the preview secrets (Flutterwave TEST
// keys) and the separate fidelstine-test database. The public site is untouched.
import { execSync } from "node:child_process";

const env = { ...process.env, ONLINE_GIVING: "1", SITE_URL: "https://flutterwave-test.fidelstine.pages.dev" };
const run = (cmd) => execSync(cmd, { stdio: "inherit", shell: true, env });

// builds with the settings above, publishes, then checks every page shows the new version
run("node scripts/deploy.mjs --branch flutterwave-test");
console.log("\nTest site: https://flutterwave-test.fidelstine.pages.dev\nRun `npm run build` before deploying the public site again.");
