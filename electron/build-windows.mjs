import { createRequire } from "node:module";
import { Arch, build, Platform } from "electron-builder";

const require = createRequire(import.meta.url);
const { updateConfig } = require("./update-config.cjs");
const feed = updateConfig(process.env.CONG_NO_UPDATE_URL, process.env.CONG_NO_UPDATE_PUBLISHER);

await build({
  targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
  publish: "never",
  config: {
    extraMetadata: { congNoUpdate: true },
    ...(feed ? {
      forceCodeSigning: true,
      win: { publisherName: [feed.publisher], verifyUpdateCodeSignature: true },
      publish: [{ provider: "generic", url: feed.url }],
    } : {}),
  },
});
