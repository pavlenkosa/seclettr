// PostCSS config for Vite.
// Wraps all :hover rules in @media (hover: hover) so touch devices
// don't get sticky hover states after tap.
const postcss = require("postcss");

/** @type {import('postcss').Plugin} */
const hoverMediaQuery = {
  postcssPlugin: "hover-media-query",
  prepare() {
    const toProcess = [];
    return {
      Rule(rule) {
        if (!rule.selector.includes(":hover")) return;
        // Skip if already inside any @media that includes 'hover'
        let p = rule.parent;
        while (p) {
          if (p.type === "atrule" && p.name === "media" && p.params.includes("hover")) return;
          p = p.parent;
        }
        toProcess.push(rule);
      },
      OnceExit() {
        for (const rule of toProcess) {
          const hoverSels = rule.selectors.filter((s) => s.includes(":hover"));
          const otherSels = rule.selectors.filter((s) => !s.includes(":hover"));

          if (hoverSels.length === 0) continue;

          // If there are non-hover selectors too, keep them in a separate rule before
          if (otherSels.length > 0) {
            const nonHoverRule = rule.cloneBefore();
            nonHoverRule.selectors = otherSels;
          }

          // Wrap hover selectors in @media (hover: hover)
          const mediaNode = postcss.atRule({ name: "media", params: "(hover: hover)" });
          const hoverRule = rule.clone();
          hoverRule.selectors = hoverSels;
          rule.replaceWith(mediaNode);
          mediaNode.append(hoverRule);
        }
      },
    };
  },
};
hoverMediaQuery.postcssPlugin = "hover-media-query";

module.exports = { plugins: [hoverMediaQuery] };
