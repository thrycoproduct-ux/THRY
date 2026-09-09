/**
 * Shared layout for the full-screen (mobile) / centered (sm+) address dialogs.
 *
 * Mobile height subtracts `--keyboard-inset` (published by useKeyboardInset
 * while the dialog is open) so the dialog — and its sticky Continue footer —
 * end above the soft keyboard in in-app browsers that only shrink the visual
 * viewport (Instagram / Facebook WebView, Chrome Android default).
 */
export const ADDRESS_DIALOG_CONTENT_CLASS =
  "left-0 top-0 z-[190] flex h-[calc(100dvh-var(--keyboard-inset,0px))] max-h-[calc(100dvh-var(--keyboard-inset,0px))] w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 transition-[height,max-height] duration-150 sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[min(90dvh,860px)] sm:w-[min(92vw,780px)] sm:max-w-[780px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:border sm:transition-none";

export const ADDRESS_DIALOG_HEADER_CLASS =
  "sticky top-0 z-10 border-b bg-background/95 px-4 py-3 text-left backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6 sm:py-4";

/** Scroll area: bottom scroll padding keeps a focused input clear of the footer. */
export const ADDRESS_DIALOG_SCROLL_CLASS =
  "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 [scroll-padding-bottom:7rem] sm:px-6 sm:py-4";
