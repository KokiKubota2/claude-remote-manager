import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const target = path.join(os.homedir(), "Library", "LaunchAgents", "com.local.claude-remote.plist");

if (fs.existsSync(target)) {
  try {
    execFileSync("launchctl", ["unload", target]);
  } catch {
    // 未ロードなら無視
  }
  fs.unlinkSync(target);
  console.log(`removed: ${target}`);
} else {
  console.log("LaunchAgent is not installed");
}
