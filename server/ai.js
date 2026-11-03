// AI assistant for the admin portal, powered by Claude through the official Anthropic SDK.
// Without ANTHROPIC_API_KEY the portal still works and falls back to rule-based insights.
const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const enabled = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
let client = null;
const getClient = () => (client ||= new Anthropic());

const VOICE = `You work for Granville's Coffee, a beloved walk-in café at 383 Reid Street in Quesnel, British Columbia, owned by Ted Martindale since 1992.
The brand voice is warm, small-town and gently funny: strangers become neighbours, everyone has directions, nobody stays a stranger.
The website jokes are always kind and never about real, named people. Use Canadian spelling.`;

class AIError extends Error {}

async function ask({ system, prompt, effort = "medium", maxTokens = 4000 }) {
  if (!enabled()) throw new AIError("AI is not set up yet. Add an ANTHROPIC_API_KEY to the server's environment to turn it on.");
  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort },
      system: VOICE + "\n\n" + system,
      messages: [{ role: "user", content: prompt }]
    });
    if (response.stop_reason === "refusal") throw new AIError("The assistant couldn't help with that request. Try rephrasing it.");
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (!text) throw new AIError("The assistant returned an empty answer. Please try again.");
    return text;
  } catch (e) {
    if (e instanceof AIError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new AIError("The AI key was rejected. Check ANTHROPIC_API_KEY on the server.");
    if (e instanceof Anthropic.RateLimitError) throw new AIError("The AI service is busy. Try again in a minute.");
    if (e instanceof Anthropic.BadRequestError) throw new AIError("The AI request was rejected: " + e.message);
    if (e instanceof Anthropic.APIError) throw new AIError("The AI service had a problem (" + (e.status || "network") + "). Try again shortly.");
    throw e;
  }
}

// Compact the dashboard so the prompt stays small and factual.
function facts(d) {
  return JSON.stringify({
    period_days: d.period.days, totals: d.totals, change_vs_previous_pct: d.change,
    top_categories: d.categories.slice(0, 6), busiest_hours: [...d.byHour].sort((a, b) => b.revenue - a.revenue).slice(0, 4),
    weekdays: d.byWeekday, menu_engineering: d.menuEngineering.slice(0, 25),
    customers: { new: d.customers.newCustomers, repeat_rate_pct: d.customers.repeatRate, segments: d.customers.segments, at_risk_count: d.customers.atRisk.length },
    low_stock: d.operations.lowStock.map((i) => ({ name: i.name, on_hand: i.on_hand, reorder_level: i.reorder_level })),
    unread_messages: d.operations.unread, website: { views: d.web.totalViews, referrers: d.web.referrers },
    staff: d.staff.map((s) => ({ role: s.role, name: s.name, hours: s.hours, revenue_per_hour: s.revenuePerHour, last_rating: s.last_rating })),
    forecast_next_7_days: d.forecast, kpis: d.kpis.map((k) => ({ label: k.label, target: k.target, actual: k.actual, status: k.status })),
    performance_score: d.performanceScore
  });
}

const tasks = {
  async briefing({ dashboard }) {
    return ask({
      effort: "high",
      system: "You are the café's business analyst. Write for a busy owner who is not a numbers person. Plain language, short sentences, no jargon, no tables.",
      prompt: `Here are this period's figures as JSON:\n${facts(dashboard)}\n\nWrite a weekly briefing with these headings: "How we did", "What's working", "What needs attention", "Three things to do this week". Use the real numbers. Each action must be specific and doable by a small café team. Under 350 words.`
    });
  },
  async question({ dashboard, question }) {
    return ask({
      system: "You are the café's business analyst. Answer only from the figures provided; if they don't contain the answer, say what data would be needed. Be concise and practical.",
      prompt: `Figures (JSON):\n${facts(dashboard)}\n\nOwner's question: ${question}`
    });
  },
  async writeCopy({ field, current, instruction }) {
    return ask({
      effort: "low", maxTokens: 1500,
      system: "You write website copy. Return only the new text, with no quotes, labels or explanation. Keep roughly the same length as the current text unless asked otherwise. For headlines you may use <br> for line breaks and <em> for the highlighted part, nothing else.",
      prompt: `Website field: ${field}\nCurrent text: ${current || "(empty)"}\nRequest: ${instruction || "Rewrite it to be fresher while keeping the voice."}`
    });
  },
  async menuDescription({ name, category, notes }) {
    return ask({
      effort: "low", maxTokens: 800,
      system: "You write one-line menu descriptions in the café's narrator voice: affectionate, a little absurd, under 18 words. Return only the line.",
      prompt: `Dish: ${name}\nCategory: ${category || ""}\nNotes: ${notes || ""}`
    });
  },
  async replyDraft({ message, name }) {
    return ask({
      effort: "low", maxTokens: 1500,
      system: "You draft friendly email replies from the café team. Warm, brief, helpful. Don't invent facts like prices, hours or availability; leave [brackets] where the owner must fill something in. Sign off as 'The Granville's team'. Return only the email body.",
      prompt: `Customer: ${name}\nTheir message: ${message}`
    });
  },
  async marketing({ goal, audience, channel }) {
    return ask({
      effort: "medium", maxTokens: 2000,
      system: "You create small-business marketing for a local café with no big budget. Give a ready-to-post piece plus two short alternatives. Keep claims truthful and generic (no prices or dates unless given).",
      prompt: `Goal: ${goal}\nAudience: ${audience || "locals and visitors to Quesnel"}\nChannel: ${channel || "Facebook post"}`
    });
  },
  async reviewHelp({ employee, notes }) {
    return ask({
      effort: "medium", maxTokens: 2000,
      system: "You help a small café owner write fair, specific, encouraging staff performance reviews. Focus on observable behaviour. Return three short sections: Strengths, Growth areas, Goals for next 90 days (SMART).",
      prompt: `Employee: ${employee}\nOwner's notes and figures: ${notes}`
    });
  }
};

module.exports = { enabled, tasks, AIError, MODEL };
