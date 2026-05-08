import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

const scanRoots = [
  "src/components/ui",
  "src/components/common/SettingsScreen.module.css",
  "src/components/common/SettingsSections.module.css",
  "src/pages/ChatPage.module.css",
  "src/pages/chat/ChatSidebar.module.css",
  "src/pages/chat/ChatThreadActions.module.css",
  "src/chats/presentation/ChatThreadChrome.module.css",
  "src/chats/presentation/security/SecurityStatusIndicator.module.css",
  "src/pages/chat/ChatThreadPane.module.css",
  "src/pages/chat/ThreadActionsDropdown.module.css",
  "src/pages/chat/CreateRoomDialog.module.css",
  "src/pages/chat/ChatMobileShell.module.css",
  "src/pages/chat/ChatMobileTabBar.module.css",
  "src/pages/RoomJoinPage.module.css",
  "src/chats/presentation/ConversationList.module.css",
  "src/chats/presentation/MessageContextMenu.module.css",
  "src/chats/presentation/MediaSendDialog.module.css",
  "src/chats/presentation/SharedMediaPanel.module.css",
  "src/chats/presentation/MessageSearchBar.module.css",
  "src/chats/presentation/MessageComposer.module.css",
  "src/chats/presentation/modals/SecurityModal.module.css",
  "src/chats/presentation/modals/NewChatModal.module.css",
  "src/chats/presentation/modals/NewGroupModal.module.css",
  "src/chats/presentation/modals/GroupMembersModal.module.css",
  "src/ui-settings",
  "src/chats/presentation/MessageList.module.css",
  "src/calls/room/RoomCallPanel.module.css",
  "src/calls/direct/presentation/DirectCallPanel.module.css",
  "src/calls/direct/presentation/components/CallSecurityCard.module.css",
  "src/calls/group/presentation/GroupCallNotice.module.css",
  "src/calls/group/presentation/GroupCallPanel.module.css",
  "src/calls/shared/presentation/CallControlsDock.module.css",
  "src/calls/shared/presentation/CallControlButton.module.css",
  "src/calls/shared/presentation/CallDevicePicker.module.css",
  "src/calls/shared/presentation/CallPanelShell.module.css",
  "src/calls/shared/presentation/CallStageViewerDialog.module.css",
];

const forbidden = [
  { pattern: /\bbackdrop-filter\b/, label: "backdrop-filter" },
  { pattern: /\blinear-gradient\(/, label: "linear-gradient" },
  {
    pattern: /\bradial-gradient\(/,
    label: "radial-gradient",
    allow: (line) => /\b(?:-webkit-)?mask\s*:/.test(line),
  },
  { pattern: /\bfilter\s*:/, label: "filter" },
  { pattern: /\btranslate[XY]\(/, label: "translateX/translateY" },
  { pattern: /\bbox-shadow\s*:/, label: "box-shadow" },
  { pattern: /\bdata-glass\b/, label: "data-glass" },
  { pattern: /\bglassMode\b|\bGlassMode\b|\bsetGlassMode\b|\bglassEffects\b/, label: "glass settings" },
];

function listFiles(path) {
  const absolute = join(repoRoot, path);
  const stat = statSync(absolute);
  if (stat.isFile()) return [absolute];

  return readdirSync(absolute).flatMap((entry) => {
    const next = join(absolute, entry);
    const nextStat = statSync(next);
    if (nextStat.isDirectory()) return listFiles(relative(repoRoot, next));
    return next;
  });
}

const files = scanRoots
  .flatMap(listFiles)
  .filter((file) => /\.(css|tsx?)$/.test(file));

const failures = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    forbidden.forEach(({ pattern, label, allow }) => {
      if (pattern.test(line) && !(typeof allow === "function" && allow(line))) {
        failures.push(`${relative(repoRoot, file)}:${index + 1} uses ${label}`);
      }
    });
  });
}

if (failures.length > 0) {
  console.error("UI style guardrails failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("UI style guardrails passed.");
