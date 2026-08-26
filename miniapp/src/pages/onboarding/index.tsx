import { useState } from "react";
import Taro from "@tarojs/taro";
import { Input, Text, Textarea, View } from "@tarojs/components";
import { request } from "../../api/client";
import "./index.scss";

type Phase = "write" | "review" | "saved";

interface PersonalProfile {
  identity: string;
  current_project: string;
  goals: string[];
  work_rhythm: string;
}

interface ContextPreview {
  raw_input: string;
  profile: PersonalProfile;
  ai_generated: boolean;
}

interface ContextComplete {
  memory_id: string;
  profile: PersonalProfile;
  saved: boolean;
}

const EMPTY_PROFILE: PersonalProfile = {
  identity: "",
  current_project: "",
  goals: [],
  work_rhythm: "",
};

function goalsToText(goals: string[]) {
  return goals.join("\n");
}

function textToGoals(value: string) {
  return value
    .split(/\n|；|;/)
    .map((item) => item.trim())
    .filter((item, index, items) => item && items.indexOf(item) === index)
    .slice(0, 8);
}

export default function Onboarding() {
  const [phase, setPhase] = useState<Phase>("write");
  const [rawInput, setRawInput] = useState("");
  const [profile, setProfile] = useState<PersonalProfile>(EMPTY_PROFILE);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

  const updateProfile = (key: keyof PersonalProfile, value: string) => {
    setProfile((current) => ({
      ...current,
      [key]: key === "goals" ? textToGoals(value) : value,
    }));
  };

  const previewContext = async () => {
    const trimmedInput = rawInput.trim();
    if (!trimmedInput || loading) return;

    setLoading(true);
    try {
      const result = await request<ContextPreview>({
        url: "/onboarding/context/preview",
        method: "POST",
        data: { raw_input: trimmedInput },
      });
      setRawInput(result.raw_input);
      setProfile(result.profile);
      setAiGenerated(result.ai_generated);
      setPhase("review");
    } catch {
      // A manual draft keeps the original sentence editable when AI is unavailable.
      setProfile(EMPTY_PROFILE);
      setAiGenerated(false);
      setPhase("review");
      Taro.showToast({ title: "先用手动方式整理，也可以继续", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const completeContext = async () => {
    if (!rawInput.trim() || loading) return;

    setLoading(true);
    try {
      const result = await request<ContextComplete>({
        url: "/onboarding/context/complete",
        method: "POST",
        data: { raw_input: rawInput.trim(), profile },
      });
      setProfile(result.profile);
      setPhase("saved");
    } catch {
      Taro.showToast({ title: "保存没有完成，请再试一次", icon: "none" });
    } finally {
      setLoading(false);
    }
  };

  const goHome = () => {
    Taro.switchTab({ url: "/pages/index/index" });
  };

  if (phase === "saved") {
    return (
      <View className="onboarding saved-state">
        <View className="saved-orbit">
          <Text className="saved-check">✓</Text>
        </View>
        <Text className="saved-kicker">YOUR SPACE IS READY</Text>
        <Text className="saved-title">你的成长空间已经准备好</Text>
        <Text className="saved-desc">
          从今天开始，你的目标、行动和复盘都会慢慢汇聚成一份真正懂你的个人上下文。
        </Text>

        <View className="saved-profile">
          <View className="saved-profile-head">
            <Text className="saved-profile-title">我先记住这些</Text>
            <Text className="saved-profile-meta">可随时修改</Text>
          </View>
          {profile.identity && (
            <View className="saved-line">
              <Text className="saved-label">身份</Text>
              <Text className="saved-value">{profile.identity}</Text>
            </View>
          )}
          {profile.current_project && (
            <View className="saved-line">
              <Text className="saved-label">正在做</Text>
              <Text className="saved-value">{profile.current_project}</Text>
            </View>
          )}
          {profile.goals.length > 0 && (
            <View className="saved-line">
              <Text className="saved-label">想去往</Text>
              <Text className="saved-value">{profile.goals.join("、")}</Text>
            </View>
          )}
          {profile.work_rhythm && (
            <View className="saved-line">
              <Text className="saved-label">节奏</Text>
              <Text className="saved-value">{profile.work_rhythm}</Text>
            </View>
          )}
        </View>

        <View className="primary-action saved-action" onClick={goHome}>
          <Text>进入我的成长空间</Text>
          <Text className="action-arrow">→</Text>
        </View>
      </View>
    );
  }

  if (phase === "review") {
    return (
      <View className="onboarding review-state">
        <View className="topbar">
          <View className="brand">
            <Text className="brand-mark">GP</Text>
            <Text className="brand-name">GrowthPilot</Text>
          </View>
          <Text className="topbar-step">02 / 02</Text>
        </View>

        <View className="review-intro">
          <Text className="eyebrow">A FIRST SKETCH OF YOU</Text>
          <Text className="review-title">这是我目前对你的理解</Text>
          <Text className="review-desc">
            {aiGenerated ? "我先替你整理了一版，确认前可以自由修改。" : "AI 暂时没有响应，你可以直接手动补充。"}
          </Text>
        </View>

        <View className="original-note">
          <Text className="note-mark">“</Text>
          <Text className="note-text">{rawInput}</Text>
        </View>

        <View className="profile-form">
          <View className="field">
            <Text className="field-label">我是谁</Text>
            <Input
              className="field-input"
              placeholder="例如：独立设计师、产品经理、正在转型的人"
              value={profile.identity}
              onInput={(event) => updateProfile("identity", event.detail.value)}
            />
          </View>
          <View className="field">
            <Text className="field-label">我正在做什么</Text>
            <Input
              className="field-input"
              placeholder="当前最重要的项目或生活主题"
              value={profile.current_project}
              onInput={(event) => updateProfile("current_project", event.detail.value)}
            />
          </View>
          <View className="field">
            <Text className="field-label">我想去往哪里</Text>
            <Textarea
              className="field-textarea"
              placeholder="可以写多个目标，每行一个"
              maxlength={600}
              value={goalsToText(profile.goals)}
              onInput={(event) => updateProfile("goals", event.detail.value)}
            />
          </View>
          <View className="field">
            <Text className="field-label">我的工作节奏</Text>
            <Input
              className="field-input"
              placeholder="例如：工作日晚上有整块时间"
              value={profile.work_rhythm}
              onInput={(event) => updateProfile("work_rhythm", event.detail.value)}
            />
          </View>
        </View>

        <View className="review-actions">
          <View className="secondary-action" onClick={() => setPhase("write")}>
            <Text>重新描述</Text>
          </View>
          <View className="primary-action" onClick={completeContext}>
            <Text>{loading ? "正在保存..." : "确认并进入"}</Text>
            {!loading && <Text className="action-arrow">→</Text>}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View className="onboarding write-state">
      <View className="topbar">
        <View className="brand">
          <Text className="brand-mark">GP</Text>
          <Text className="brand-name">GrowthPilot</Text>
        </View>
        <Text className="topbar-link" onClick={goHome}>稍后再说</Text>
      </View>

      <View className="hero">
        <Text className="eyebrow">PERSONAL GROWTH OS</Text>
        <Text className="hero-title">欢迎来到个人成长计划，{`\n`}让我们带你进入新的里程</Text>
        <Text className="hero-desc">
          不用填写一长串表格。先用自己的话，告诉我你是谁、正在忙什么，以及此刻最想改变什么。
        </Text>
      </View>

      <View className="input-card">
        <View className="input-card-head">
          <Text className="input-label">从现在开始说起</Text>
          <Text className="input-count">{rawInput.length} / 2000</Text>
        </View>
        <Textarea
          className="context-input"
          placeholder="例如：我是一个正在做独立产品的设计师，白天上班，晚上想把产品做出来，也想重新找回稳定运动的节奏。"
          maxlength={2000}
          value={rawInput}
          onInput={(event) => setRawInput(event.detail.value)}
        />
        <View className="input-hint">
          <Text className="hint-dot" />
          <Text>这句话会成为你的第一条个人 Memory</Text>
        </View>
      </View>

      <View className="example-strip">
        <Text className="example-label">可以从这些方向开始</Text>
        <Text className="example-text">身份 · 项目 · 目标 · 工作节奏 · 想养成的习惯</Text>
      </View>

      <View className={`primary-action write-action ${!rawInput.trim() || loading ? "disabled" : ""}`} onClick={previewContext}>
        <Text>{loading ? "正在理解..." : "继续"}</Text>
        {!loading && <Text className="action-arrow">→</Text>}
      </View>
    </View>
  );
}
