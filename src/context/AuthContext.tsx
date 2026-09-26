import * as authService from "@/services/auth";
import type {
  AuthSession,
  LoginResult,
  PublicUser,
  RegisterPayload,
  TwoFactorState,
} from "@/types";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

export type AuthStep = "credentials" | "two-factor";

type AuthContextValue = {
  user: PublicUser | null;
  session: AuthSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** The sign-in is waiting for a second factor code. */
  step: AuthStep;
  twoFactorChallengeId: string | null;
  /** Why the last attempt was refused, so the form can explain it. */
  lastError: LoginFailure;
  twoFactor: TwoFactorState | undefined;
  login: (
    email: string,
    password: string,
    rememberMe: boolean,
  ) => Promise<LoginResult>;
  verifyTwoFactor: (code: string) => Promise<LoginResult>;
  cancelTwoFactor: () => void;
  register: (payload: RegisterPayload) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<PublicUser | null>;
  refreshTwoFactor: () => void;
  sessions: AuthSession[];
  loadSessions: () => Promise<void>;
  revokeSession: (id: string) => Promise<void>;
};

type LoginFailure = Extract<LoginResult, { status: "failed" }>["reason"] | null;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // The session is read once, during the first render: it is a synchronous
  // store read, so no loading flash and no effect-driven cascade.
  const [restored] = useState(() => authService.resolveSession());

  const [user, setUser] = useState<PublicUser | null>(
    restored && !restored.expired ? restored.user : null,
  );
  const [session, setSession] = useState<AuthSession | null>(
    restored && !restored.expired ? restored.session : null,
  );
  const [isLoading] = useState(false);
  const [step, setStep] = useState<AuthStep>("credentials");
  const [twoFactorChallengeId, setTwoFactorChallengeId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<LoginFailure>(
    restored?.expired ? "sessionExpired" : null,
  );
  const [twoFactor, setTwoFactor] = useState<TwoFactorState | undefined>(() => {
    const current = restored && !restored.expired ? restored.user : null;
    return current ? authService.getTwoFactorState(current.id) : undefined;
  });
  const [sessions, setSessions] = useState<AuthSession[]>([]);

  const applyResult = useCallback((result: LoginResult) => {
    if (result.status === "authenticated") {
      setUser(result.user);
      setSession(result.session);
      setStep("credentials");
      setTwoFactorChallengeId(null);
      setLastError(null);
      return result;
    }

    if (result.status === "requiresTwoFactor") {
      setStep("two-factor");
      setTwoFactorChallengeId(result.challengeId);
      setLastError(null);
      return result;
    }

    setLastError(result.reason);
    return result;
  }, []);

  const loadSessions = useCallback(async () => {
    if (!user) return;
    setSessions(await authService.listUserSessions(user.id));
  }, [user]);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      setLastError(null);
      return applyResult(await authService.login({ email, password, rememberMe }));
    },
    [applyResult],
  );

  const verifyTwoFactor = useCallback(
    async (code: string) => {
      if (!twoFactorChallengeId) {
        const failure: LoginResult = { status: "failed", reason: "twoFactorInvalid" };
        setLastError(failure.reason);
        return failure;
      }
      setLastError(null);
      return applyResult(
        await authService.verifyTwoFactor(twoFactorChallengeId, code),
      );
    },
    [applyResult, twoFactorChallengeId],
  );

  const cancelTwoFactor = useCallback(() => {
    setStep("credentials");
    setTwoFactorChallengeId(null);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const created = await authService.register(payload);
    setUser(created);
    return created;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setSession(null);
    setSessions([]);
    setTwoFactor(undefined);
    setStep("credentials");
    setTwoFactorChallengeId(null);
  }, []);

  const refresh = useCallback(async () => {
    const restored = authService.resolveSession()?.user ?? null;
    setUser(restored);
    if (restored) setTwoFactor(authService.getTwoFactorState(restored.id));
    return restored;
  }, []);

  const refreshTwoFactor = useCallback(() => {
    setTwoFactor(user ? authService.getTwoFactorState(user.id) : undefined);
  }, [user]);

  const revokeSession = useCallback(
    async (id: string) => {
      await authService.revokeSession(id);
      const resolved = authService.resolveSession();
      // Revoking the current session signs the user out, like a server would.
      if (!resolved) {
        setUser(null);
        setSession(null);
        setSessions([]);
        return;
      }
      setSession(resolved.session);
      await loadSessions();
    },
    [loadSessions],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isAuthenticated: user !== null,
      isLoading,
      step,
      twoFactorChallengeId,
      lastError,
      twoFactor,
      login,
      verifyTwoFactor,
      cancelTwoFactor,
      register,
      logout,
      refresh,
      refreshTwoFactor,
      sessions,
      loadSessions,
      revokeSession,
    }),
    [
      user,
      session,
      isLoading,
      step,
      twoFactorChallengeId,
      lastError,
      twoFactor,
      login,
      verifyTwoFactor,
      cancelTwoFactor,
      register,
      logout,
      refresh,
      refreshTwoFactor,
      sessions,
      loadSessions,
      revokeSession,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
