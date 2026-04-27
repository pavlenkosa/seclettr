const CHAT_QUERY_PARAM = "chat";
const GROUP_QUERY_PARAM = "group";
const SAFE_THREAD_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function normalizeSearch(search: string): string {
  if (!search) return "";
  return search.startsWith("?") ? search.slice(1) : search;
}

function normalizeThreadRouteId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!SAFE_THREAD_ID_PATTERN.test(normalized)) {
    return null;
  }
  return normalized;
}

export function getConversationIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(normalizeSearch(search));
  return normalizeThreadRouteId(params.get(CHAT_QUERY_PARAM));
}

export function getGroupIdFromSearch(search: string): string | null {
  const params = new URLSearchParams(normalizeSearch(search));
  return normalizeThreadRouteId(params.get(GROUP_QUERY_PARAM));
}

export function buildSearchWithConversation(
  search: string,
  conversationId: string | null
): string {
  const params = new URLSearchParams(normalizeSearch(search));
  const safeConversationId = normalizeThreadRouteId(conversationId);
  if (safeConversationId) {
    params.set(CHAT_QUERY_PARAM, safeConversationId);
    params.delete(GROUP_QUERY_PARAM);
  } else {
    params.delete(CHAT_QUERY_PARAM);
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}

export function buildSearchWithGroup(
  search: string,
  groupId: string | null
): string {
  const params = new URLSearchParams(normalizeSearch(search));
  const safeGroupId = normalizeThreadRouteId(groupId);
  if (safeGroupId) {
    params.set(GROUP_QUERY_PARAM, safeGroupId);
    params.delete(CHAT_QUERY_PARAM);
  } else {
    params.delete(GROUP_QUERY_PARAM);
  }
  const next = params.toString();
  return next ? `?${next}` : "";
}
