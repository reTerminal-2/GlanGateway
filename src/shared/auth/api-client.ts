import axios, { InternalAxiosRequestConfig } from "axios";
import Cookies from "js-cookie";

// Define base URL based on environment
const getBaseURL = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // Fallback URLs (production domains)
  if (
    window.location.hostname === "glangateway.netlify.app" ||
    window.location.hostname === "mern-booking-hotel.netlify.app" ||
    window.location.hostname.includes("vercel.app")
  ) {
    return import.meta.env.VITE_API_URL || "https://glan-getaway-backend.onrender.com";
  }

  if (window.location.hostname === "localhost") {
    return "http://localhost:5000";
  }

  // Default to production
  return "https://hotel-booking-backend.duckdns.org";
};

export const getApiBaseUrl = getBaseURL;

// Extend axios config to include metadata
interface CustomAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: { retryCount: number };
}

// Track active requests for automatic cancellation
const activeRequests = new Map<string, AbortController>();

// Create axios instance with consistent configuration
const axiosInstance = axios.create({
  baseURL: getBaseURL(),
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
  timeout: 15000,
});

// Helper to generate unique request keys
const getRequestKey = (config: any) => {
  return `${config.method?.toUpperCase()}:${config.url}`;
};

/**
 * Cancel all currently active in-flight requests
 */
export const cancelAllRequests = () => {
  activeRequests.forEach(controller => controller.abort());
  activeRequests.clear();
};

/**
 * Cancel specific request by method and url
 */
export const cancelRequest = (method: string, url: string) => {
  const key = `${method.toUpperCase()}:${url}`;
  const controller = activeRequests.get(key);
  if (controller) {
    controller.abort();
    activeRequests.delete(key);
  }
};

// Request interceptor to add Authorization header with JWT token
axiosInstance.interceptors.request.use((config: CustomAxiosRequestConfig) => {
  const token = localStorage.getItem("session_id");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  config.metadata = { retryCount: 0 };

  // Skip cancellation if custom header is set
  if (config.headers['X-Skip-Cancellation']) {
    delete config.headers['X-Skip-Cancellation'];
    return config;
  }

  // Add AbortController for request cancellation
  const requestKey = getRequestKey(config);

  // Cancel existing duplicate request if already pending
  if (activeRequests.has(requestKey)) {
    const existingController = activeRequests.get(requestKey)!;
    existingController.abort();
  }

  // Create new abort controller for this request
  const controller = new AbortController();
  config.signal = controller.signal;
  activeRequests.set(requestKey, controller);

  return config;
});

// Response interceptor to handle common errors and retries
axiosInstance.interceptors.response.use(
  (response) => {
    // Cleanup completed request
    const requestKey = getRequestKey(response.config);
    activeRequests.delete(requestKey);
    return response;
  },
  async (error) => {
    const { config } = error;

    // Cleanup failed/aborted request
    if (config) {
      const requestKey = getRequestKey(config);
      activeRequests.delete(requestKey);
    }

    // Handle aborted requests (don't retry, mark as canceled)
    if (axios.isCancel(error) || error.code === 'ECONNABORTED') {
      error.isCanceled = true;
      return Promise.reject(error);
    }

    // Handle 401 errors by clearing session
    if (error.response?.status === 401) {
      Cookies.remove("session_id");
      localStorage.removeItem("session_id");
      localStorage.removeItem("user_id");
      localStorage.removeItem("user_email");
      localStorage.removeItem("user_name");
      localStorage.removeItem("user_role");
    }

    // Don't retry on connection refused or network errors
    if (error.code === 'ECONNREFUSED' || 
        error.message?.includes('ERR_CONNECTION_REFUSED') ||
        error.code === 'NETWORK_ERROR' ||
        error.isCanceled) {
      return Promise.reject(error);
    }

    // Handle rate limiting (429) with retry logic
    if (error.response?.status === 429 && config) {
      const customConfig = config as CustomAxiosRequestConfig;
      if (customConfig.metadata && customConfig.metadata.retryCount < 2) {
        customConfig.metadata.retryCount += 1;
        const delay = Math.pow(2, customConfig.metadata.retryCount - 1) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return axiosInstance(config);
      }
    }

    // Handle other network errors with retry
    if (!error.response && config) {
      const customConfig = config as CustomAxiosRequestConfig;
      if (customConfig.metadata && customConfig.metadata.retryCount < 1) {
        customConfig.metadata.retryCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return axiosInstance(config);
      }
    }

    return Promise.reject(error);
  }
);

// Helper to check if error is a canceled request
export const isRequestCanceled = (error: any): boolean => {
  return error?.isCanceled === true || 
         error?.code === 'ECONNABORTED' || 
         axios.isCancel(error);
};

// Authentication types
export interface SignInFormData {
  email: string;
  password: string;
}

export interface AuthResponse {
  userId: string;
  message: string;
  token: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

// Authentication functions
export const signIn = async (formData: SignInFormData): Promise<AuthResponse> => {
  try {
    console.log('🔍 Attempting sign in with:', { email: formData.email });

    const response = await axiosInstance.post("/api/auth/login", formData);

    console.log('🔍 Login response:', response.data);

    // Optimized token storage - use synchronous operations
    const token = response.data?.token;
    if (token) {
      localStorage.setItem("session_id", token);
      console.log('🔍 Token stored in localStorage');
    }

    // Batch user info storage for better performance
    if (response.data?.userId) {
      localStorage.setItem("user_id", response.data.userId);
    }
    if (response.data?.user) {
      const { email, firstName, lastName, role } = response.data.user;
      if (email) localStorage.setItem("user_email", email);
      if (role) localStorage.setItem("user_role", role);
      const name = [firstName, lastName].filter(Boolean).join(" ") || email;
      if (name) localStorage.setItem("user_name", name);
    }

    console.log('🔍 Login successful, returning data');
    return response.data;
  } catch (error: any) {
    console.log('🔍 Login error:', error);

    // Faster error handling with specific checks
    if (error.code === 'ECONNABORTED') {
      throw new Error("Sign-in timed out. Please check your connection and try again.");
    }
    if (error.response?.data?.message) {
      throw new Error(error.response.data.message);
    } else if (error.message) {
      throw new Error(error.message);
    } else {
      throw new Error("Sign-in failed. Please try again.");
    }
  }
};

export const signOut = async (): Promise<void> => {
  try {
    await axiosInstance.post("/api/auth/logout");
  } catch (error) {
    // Ignore logout errors
  } finally {
    Cookies.remove("session_id");
    localStorage.removeItem("session_id");
    localStorage.removeItem("user_id");
    localStorage.removeItem("user_email");
    localStorage.removeItem("user_name");
    localStorage.removeItem("user_role");
    localStorage.removeItem("is_super_admin"); // Clear admin status
  }
};

export const validateToken = async (): Promise<{ userId: string }> => {
  const response = await axiosInstance.get("/api/auth/validate-token");
  return response.data;
};

export const fetchCurrentUser = async (): Promise<{
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}> => {
  const response = await axiosInstance.get("/api/users/me");
  return response.data;
};

export default axiosInstance;
