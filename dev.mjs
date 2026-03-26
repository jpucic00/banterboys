import { execSync } from "child_process";
const port = process.env.PORT || 3000;
execSync(`npx next dev --port ${port}`, { stdio: "inherit", cwd: import.meta.dirname });
