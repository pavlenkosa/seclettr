import { createComposerEmojiCatalog, type ComposerEmojiCatalog } from "./composer-emojis";
import { GENERATED_COMPOSER_EMOJI_GROUPS } from "./composer-emoji-data.generated";

let cachedComposerEmojiCatalog: ComposerEmojiCatalog | null = null;

export async function loadComposerEmojiCatalog(): Promise<ComposerEmojiCatalog> {
  cachedComposerEmojiCatalog ??= createComposerEmojiCatalog(GENERATED_COMPOSER_EMOJI_GROUPS);
  return cachedComposerEmojiCatalog;
}
