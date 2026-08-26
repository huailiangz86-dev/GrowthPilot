import Taro from "@tarojs/taro";

const BASE_URL = "http://localhost:8002/api/v1";

interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  code?: string;
}

interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  data?: Record<string, unknown>;
}

export async function request<T>(options: RequestOptions): Promise<T> {
  const token = Taro.getStorageSync("gp_token");

  const networkType = (await Taro.getNetworkType()).networkType;
  if (networkType === "none") {
    Taro.showToast({ title: "网络已断开", icon: "none" });
    throw new Error("Network disconnected");
  }

  const res = await Taro.request({
    url: `${BASE_URL}${options.url}`,
    method: options.method || "GET",
    data: options.data,
    header: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  const body = res.data as ApiResponse<T>;

  if (res.statusCode === 401) {
    Taro.removeStorageSync("gp_token");
    Taro.redirectTo({ url: "/pages/index/index" });
    throw new Error("Unauthorized");
  }

  if (res.statusCode === 429) {
    Taro.showToast({ title: body.error || "请求太频繁", icon: "none" });
    throw new Error("Rate limited");
  }

  if (res.statusCode >= 500) {
    Taro.showToast({ title: "服务暂时不可用", icon: "none" });
    throw new Error("Server error");
  }

  if (!body.success) {
    throw new Error(body.error || "Request failed");
  }

  return body.data as T;
}
