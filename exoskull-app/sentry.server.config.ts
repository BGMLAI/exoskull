import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,

  enabled: process.env.NODE_ENV === "production",

  // Performance monitoring: sample 10% of server transactions
  tracesSampleRate: 0.1,

  // Filter noisy server errors
  ignoreErrors: ["NEXT_NOT_FOUND", "NEXT_REDIRECT", "AbortError"],

  beforeSend(event) {
    // Scrub credentials from server errors
    if (event.request?.headers) {
      delete event.request.headers["authorization"];
      delete event.request.headers["cookie"];
      delete event.request.headers["x-cron-secret"];
    }
    return event;
  },
});
