export const BACKEND_URL = "https://api.downloadsubtitles.online";

// Low-star (1-3) feedback form, opened from the review prompt toast.
export const FEEDBACK_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSelwO0_0e_gSuOZLs2WsVx0Yzso8UAnmI7nTHda1OdT9Cfbpw/viewform?usp=publish-editor";

// Must stay reachable after the extension files have been removed.
export const UNINSTALL_FEEDBACK_PAGE_URL = "https://downloadsubtitles.online/uninstall/";
// Switch to UNINSTALL_FEEDBACK_PAGE_URL after docs/uninstall is deployed.
// The existing Google Form remains reachable for installed builds meanwhile.
export const UNINSTALL_FEEDBACK_URL = FEEDBACK_FORM_URL;
