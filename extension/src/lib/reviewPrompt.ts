const DOWNLOAD_COUNT_KEY = "downloadCount";
const REVIEW_PROMPT_SHOWN_KEY = "reviewPromptShown";
const PROMPT_AT_DOWNLOAD_COUNT = 3;

// Counts a successful download and reports whether this is the moment to
// nudge the user for a review — exactly once, on the Nth download, ever.
export async function recordDownloadAndMaybeShowReviewPrompt(): Promise<boolean> {
  const data = await chrome.storage.local.get([DOWNLOAD_COUNT_KEY, REVIEW_PROMPT_SHOWN_KEY]);
  const count = ((data[DOWNLOAD_COUNT_KEY] as number | undefined) ?? 0) + 1;
  const alreadyShown = Boolean(data[REVIEW_PROMPT_SHOWN_KEY]);
  const shouldShow = !alreadyShown && count >= PROMPT_AT_DOWNLOAD_COUNT;

  await chrome.storage.local.set({
    [DOWNLOAD_COUNT_KEY]: count,
    ...(shouldShow ? { [REVIEW_PROMPT_SHOWN_KEY]: true } : {}),
  });

  return shouldShow;
}

// Only resolves to the real Chrome Web Store listing once the extension is
// actually published there (and, ideally, its manifest "key" is pinned so
// chrome.runtime.id matches the published listing's id during local testing).
export function reviewPageUrl(): string {
  return `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews`;
}
