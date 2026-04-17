// ---------------------------------------------------------------
//  Vercel Serverless Function  (api/generate.js)
// ---------------------------------------------------------------

import { Configuration, OpenAIApi } from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;        // set in Vercel
const SHEET_WEBHOOK_URL = process.env.SHEET_WEBHOOK_URL; // set in Vercel

export default async function handler(req, res) {
  // ---- allow only POST -------------------------------------------------
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // ---- read payload ----------------------------------------------------
  const { session_id, object, click_number, participant_raw } = req.body || {};

  if (!session_id || !object) {
    return res
      .status(400)
      .json({ error: "`session_id` and `object` are required" });
  }

  // ---- 1️⃣ CALL THE LLM (replaceable – see Section 2) -----------------
  const configuration = new Configuration({ apiKey: OPENAI_API_KEY });
  const openai = new OpenAIApi(configuration);

  const prompt = `
You are a creativity coach. List 5 **different** alternative uses for a **${object}**.
- Each use is a short phrase (max 8 words).
- Do NOT repeat ideas.
- Avoid unsafe or illegal uses.
- Present each idea on its own line.
`;

  let suggestions = [];

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-4o-mini",          // cheap & fast – change if you want
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
    });

    const raw = response.data.choices[0].message.content.trim();
    suggestions = raw
      .split("\n")
      .map(l => l.replace(/^\d+[\).]?\s*/, "").trim())
      .filter(Boolean);
  } catch (e) {
    console.error("OpenAI error:", e);
    return res.status(500).json({ error: "LLM request failed" });
  }

  // ---- 2️⃣ LOG TO GOOGLE SHEET -----------------------------------------
  const payload = {
    session_id,
    object,
    click_number,
    ai_suggestions: suggestions.join(" | "),
    participant_raw: participant_raw || "",
  };

  try {
    await fetch(SHEET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("Sheet webhook failed (non‑fatal):", e);
    // We still return the suggestions to the user.
  }

  // ---- 3️⃣ RETURN TO the browser ----------------------------------------
  return res.status(200).json({ suggestions });
}
