import { useState } from "react";
import { AuthUser } from "../types";
import { loginUser, registerUser } from "../api/authApi";

interface UseAuthOptions {
  onAuthSuccess: (token: string, user: AuthUser) => void;
}

export function useAuth({ onAuthSuccess }: UseAuthOptions) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isLogin && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = isLogin
        ? await loginUser(email, password)
        : await registerUser(email, password, name);
      onAuthSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const fillQuickDemo = () => {
    setEmail("swarnaaishwarya17@gmail.com");
    setPassword("MamuSecure2026!");
    setName("Aishwarya");
    setIsLogin(true);
  };

  return {
    isLogin, setIsLogin, email, setEmail,
    password, setPassword, confirmPassword, setConfirmPassword,
    name, setName, error, loading,
    handleSubmit, fillQuickDemo,
  };
}
