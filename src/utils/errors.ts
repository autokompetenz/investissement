import { ApiError } from "@/services/api";

/** Maps a service error to a translation key. Never surfaces a raw message. */
export const getErrorKey = (error: unknown): string => {
  if (error instanceof ApiError) {
    switch (error.message) {
      case "invalidCredentials":
        return "auth.errors.invalidCredentials";
      case "emailAlreadyUsed":
        return "auth.errors.emailAlreadyUsed";
      case "userNotFound":
        return "auth.errors.userNotFound";
      default:
        return "auth.errors.unknown";
    }
  }

  return "auth.errors.unknown";
};
