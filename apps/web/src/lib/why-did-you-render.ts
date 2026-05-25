// Dev-only: trace unnecessary re-renders.
// Loaded via main.tsx only in import.meta.env.DEV builds.
// Toggle per-component: ComponentName.whyDidYouRender = true;
import React from "react";
import whyDidYouRender from "@welldone-software/why-did-you-render";

whyDidYouRender(React, {
  trackAllPureComponents: false,
  logOnDifferentValues: true,
  collapseGroups: true,
  // To audit a specific component uncomment the import and annotate it:
  // import { MessageListRow } from "@/chats/presentation/message-list/MessageListRow";
  // MessageListRow.whyDidYouRender = true;
});
